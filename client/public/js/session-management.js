/* eslint-disable no-param-reassign -- WebAuthn option buffers and browser globals must be prepared in place. */
(function (window, document) {
    'use strict';

    function createText(tag, text) {
        var element = document.createElement(tag);
        element.textContent = text;
        return element;
    }

    function decodeBase64Url(value) {
        var base64 = value.replace(/-/g, '+').replace(/_/g, '/');
        var bytes = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
        return Uint8Array.from(bytes, function (character) { return character.charCodeAt(0); });
    }

    function encodeBase64Url(value) {
        var bytes = new Uint8Array(value);
        var binary = Array.from(bytes, function (byte) { return String.fromCharCode(byte); }).join('');
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function prepareCreationOptions(options) {
        options.challenge = decodeBase64Url(options.challenge);
        options.user.id = decodeBase64Url(options.user.id);
        (options.excludeCredentials || []).forEach(function (credential) {
            credential.id = decodeBase64Url(credential.id);
        });
        return options;
    }

    function prepareRequestOptions(options) {
        options.challenge = decodeBase64Url(options.challenge);
        (options.allowCredentials || []).forEach(function (credential) {
            credential.id = decodeBase64Url(credential.id);
        });
        return options;
    }

    function serializeCredential(credential) {
        if (typeof credential.toJSON === 'function') return credential.toJSON();
        var response = credential.response;
        return {
            id: credential.id,
            rawId: encodeBase64Url(credential.rawId),
            type: credential.type,
            authenticatorAttachment: credential.authenticatorAttachment,
            clientExtensionResults: credential.getClientExtensionResults(),
            response: response.attestationObject ? {
                attestationObject: encodeBase64Url(response.attestationObject),
                clientDataJSON: encodeBase64Url(response.clientDataJSON),
                transports: typeof response.getTransports === 'function' ? response.getTransports() : []
            } : {
                authenticatorData: encodeBase64Url(response.authenticatorData),
                clientDataJSON: encodeBase64Url(response.clientDataJSON),
                signature: encodeBase64Url(response.signature),
                userHandle: response.userHandle ? encodeBase64Url(response.userHandle) : null
            }
        };
    }

    async function enrollPasskey(name) {
        if (!window.PublicKeyCredential || !navigator.credentials) throw new Error('Passkeys are not supported on this device');
        var creation = NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('webauthn.registrationOptions', {
            method: 'POST',
            parseJson: true
        }), 'Failed to create passkey options');
        var credential = await navigator.credentials.create({ publicKey: prepareCreationOptions(creation.options) });
        return NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('webauthn.registrationVerify', {
            method: 'POST',
            parseJson: true,
            body: JSON.stringify({
                challengeId: creation.challengeId,
                response: serializeCredential(credential),
                name: name || 'Passkey'
            })
        }), 'Failed to enroll passkey');
    }

    async function confirmPasswordChange() {
        if (!window.PublicKeyCredential || !navigator.credentials) throw new Error('Passkeys are not supported on this device');
        var request = NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('webauthn.passwordOptions', {
            method: 'POST',
            parseJson: true
        }), 'Failed to create passkey confirmation');
        var credential = await navigator.credentials.get({ publicKey: prepareRequestOptions(request.options) });
        var verification = NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('webauthn.passwordVerify', {
            method: 'POST',
            parseJson: true,
            body: JSON.stringify({
                challengeId: request.challengeId,
                response: serializeCredential(credential)
            })
        }), 'Failed to verify passkey');
        return verification.confirmationId;
    }

    async function loadPasskeys(container) {
        var response = NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('webauthn.credentials', {
            parseJson: true
        }), 'Failed to load passkeys');
        var credentials = response.credentials || [];
        container.textContent = '';

        credentials.forEach(function (credential) {
            var row = document.createElement('div');
            row.className = 'session-management-row';
            row.appendChild(createText('strong', credential.name || 'Passkey'));
            row.appendChild(createText('span', 'Created: ' + new Date(credential.createdAt).toLocaleString()));
            row.appendChild(createText('span', 'Last used: ' + (credential.lastUsedAt ? new Date(credential.lastUsedAt).toLocaleString() : 'Never')));
            var revoke = createText('button', 'Revoke passkey');
            revoke.type = 'button';
            revoke.addEventListener('click', async function () {
                await AppConfig.fetchRoute('webauthn.credential', {
                    method: 'DELETE',
                    parseJson: true
                }, { params: { credentialId: credential.credentialId } });
                await loadPasskeys(container);
            });
            row.appendChild(revoke);
            container.appendChild(row);
        });

        if (credentials.length === 0) container.appendChild(createText('p', 'No passkeys enrolled.'));
    }

    async function loadRecoveryCodeStatus(container) {
        var response = NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('webauthn.recoveryCodeStatus', {
            parseJson: true
        }), 'Failed to load recovery-code status');
        container.textContent = 'Unused recovery codes: ' + response.remaining + '. Used recovery codes: ' + response.used + '.';
    }

    async function generateRecoveryCodes() {
        return NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('webauthn.recoveryCodes', {
            method: 'POST',
            parseJson: true,
            body: JSON.stringify({ count: 10 })
        }), 'Failed to generate recovery codes');
    }

    async function recoverLostDevice(recoveryCode) {
        return NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('webauthn.lostDeviceRecover', {
            method: 'POST',
            parseJson: true,
            body: JSON.stringify({ recoveryCode: recoveryCode, revokePasskeys: true })
        }), 'Lost-device recovery failed');
    }

    var lastRecoveryCodes = [];

    function recoveryCodeDocumentText() {
        return [
            'Nocturnal recovery codes',
            '',
            'These codes were shown only once. Store them offline.',
            'Each code can be used one time for lost-device recovery.',
            '',
            ...lastRecoveryCodes
        ].join('\n');
    }

    function setRecoveryCodeActionsEnabled(enabled) {
        var download = document.getElementById('downloadRecoveryCodes');
        var print = document.getElementById('printRecoveryCodes');
        if (download) download.disabled = !enabled;
        if (print) print.disabled = !enabled;
    }

    function downloadRecoveryCodes() {
        if (lastRecoveryCodes.length === 0) return;
        var blob = new Blob([recoveryCodeDocumentText()], { type: 'text/plain' });
        var link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'nocturnal-recovery-codes.txt';
        link.click();
        URL.revokeObjectURL(link.href);
    }

    function printRecoveryCodes() {
        if (lastRecoveryCodes.length === 0) return;
        var printWindow = window.open('', '_blank', 'noopener,noreferrer');
        if (!printWindow) return;
        var pre = printWindow.document.createElement('pre');
        pre.textContent = recoveryCodeDocumentText();
        printWindow.document.body.appendChild(pre);
        printWindow.print();
        printWindow.close();
    }

    async function loadSessions(container) {
        var routePrefix = container.dataset.sessionType === 'patient' ? 'patients' : 'auth';
        var response = NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute(routePrefix + '.sessions', {
            parseJson: true
        }), 'Failed to load active sessions');
        var sessions = response.sessions || [];
        AppUi.setSafeHtml(container, '');

        sessions.forEach(function (session) {
            var row = document.createElement('div');
            row.className = 'session-management-row';
            row.appendChild(createText('strong', session.userAgent || 'Unknown device'));
            row.appendChild(createText('span', 'Last used: ' + new Date(session.lastUsedAt || session.createdAt).toLocaleString()));
            row.appendChild(createText('span', 'IP: ' + (session.ipAddress || 'Unknown')));
            var revoke = createText('button', 'Revoke');
            revoke.type = 'button';
            revoke.addEventListener('click', async function () {
                await AppConfig.fetchRoute(routePrefix + '.session', {
                    method: 'DELETE',
                    parseJson: true
                }, { params: { sessionId: session._id } });
                await loadSessions(container);
            });
            row.appendChild(revoke);
            container.appendChild(row);
        });

        if (sessions.length === 0) container.appendChild(createText('p', 'No active sessions.'));
    }

    document.addEventListener('DOMContentLoaded', function () {
        var container = document.getElementById('activeSessionsList');
        var revokeAll = document.getElementById('revokeAllSessions');
        var enroll = document.getElementById('enrollPasskey');
        var passkeyList = document.getElementById('passkeyList');
        var generateCodes = document.getElementById('generateRecoveryCodes');
        var downloadCodes = document.getElementById('downloadRecoveryCodes');
        var printCodes = document.getElementById('printRecoveryCodes');
        var recoveryCodeOutput = document.getElementById('recoveryCodesOutput');
        var recoveryCodeStatus = document.getElementById('recoveryCodeStatus');
        var lostDeviceCode = document.getElementById('lostDeviceRecoveryCode');
        var recoverLostDeviceButton = document.getElementById('recoverLostDevice');
        if (!container || !revokeAll) return;
        loadSessions(container).catch(function () {
            container.textContent = 'Active sessions could not be loaded.';
        });
        if (passkeyList) {
            loadPasskeys(passkeyList).catch(function () {
                passkeyList.textContent = 'Passkeys could not be loaded.';
            });
        }
        if (recoveryCodeStatus) {
            loadRecoveryCodeStatus(recoveryCodeStatus).catch(function () {
                recoveryCodeStatus.textContent = 'Recovery-code status could not be loaded.';
            });
        }
        revokeAll.addEventListener('click', async function () {
            var routePrefix = container.dataset.sessionType === 'patient' ? 'patients' : 'auth';
            await AppConfig.fetchRoute(routePrefix + '.sessions', { method: 'DELETE', parseJson: true });
            window.location.href = AppConfig.routes.page(container.dataset.sessionType === 'patient' ? 'patient.login' : 'home');
        });
        if (enroll) {
            enroll.addEventListener('click', async function () {
                enroll.disabled = true;
                try {
                    await enrollPasskey('Primary passkey');
                    enroll.textContent = 'Passkey enrolled';
                    if (passkeyList) await loadPasskeys(passkeyList);
                } catch (error) {
                    enroll.textContent = error.message || 'Passkey enrollment failed';
                } finally {
                    enroll.disabled = false;
                }
            });
        }
        if (generateCodes && recoveryCodeOutput) {
            generateCodes.addEventListener('click', async function () {
                generateCodes.disabled = true;
                try {
                    var result = await generateRecoveryCodes();
                    lastRecoveryCodes = result.codes || [];
                    recoveryCodeOutput.textContent = lastRecoveryCodes.join('\n');
                    setRecoveryCodeActionsEnabled(lastRecoveryCodes.length > 0);
                    if (recoveryCodeStatus) await loadRecoveryCodeStatus(recoveryCodeStatus);
                } catch (error) {
                    lastRecoveryCodes = [];
                    setRecoveryCodeActionsEnabled(false);
                    recoveryCodeOutput.textContent = error.message || 'Recovery codes could not be generated.';
                } finally {
                    generateCodes.disabled = false;
                }
            });
        }
        if (downloadCodes) downloadCodes.addEventListener('click', downloadRecoveryCodes);
        if (printCodes) printCodes.addEventListener('click', printRecoveryCodes);
        if (recoverLostDeviceButton && lostDeviceCode) {
            recoverLostDeviceButton.addEventListener('click', async function () {
                recoverLostDeviceButton.disabled = true;
                try {
                    var recovery = await recoverLostDevice(lostDeviceCode.value);
                    lostDeviceCode.value = '';
                    if (passkeyList) await loadPasskeys(passkeyList);
                    if (recoveryCodeStatus) await loadRecoveryCodeStatus(recoveryCodeStatus);
                    recoverLostDeviceButton.textContent = recovery.passkeysRevoked ? 'Passkeys revoked' : 'Recovered';
                } catch (error) {
                    recoverLostDeviceButton.textContent = error.message || 'Lost-device recovery failed';
                } finally {
                    recoverLostDeviceButton.disabled = false;
                }
            });
        }
    });

    window.NocturnalWebAuthn = {
        enrollPasskey: enrollPasskey,
        confirmPasswordChange: confirmPasswordChange,
        generateRecoveryCodes: generateRecoveryCodes,
        recoverLostDevice: recoverLostDevice
    };
}(window, document));
