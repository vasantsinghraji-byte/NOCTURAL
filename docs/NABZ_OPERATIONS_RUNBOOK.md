# Nabz operations runbook (staging)

*How to deploy, build the Android apps, and manage sign-in and signing keys. This document lists where secrets are kept, never the secrets themselves.*

## Addresses

| What | URL |
|---|---|
| API | `https://tiuh3tvxsa.ap-south-1.awsapprunner.com` (health: `/api/v1/health` shows `deploymentCommit`) |
| Website | `https://79fkmxu8w3.ap-south-1.awsapprunner.com` |
| Admin panel | website `/admin/login`; requires an authenticator app |
| Pharmacy store dashboard | website `/vendor/today`, or the Nabz Partner app |

AWS account `554433963412`, region `ap-south-1`. Always use the AWS CLI profile **`nabz`** (IAM user `nabz-deployer`). The default profile has no App Runner access.

## Deploy the API and website

1. Commit and push the branch (`feature/nabz-care-marketplace`).
2. Upload the source and start both image builds:

   ```bash
   git archive --format=zip -o source.zip HEAD
   aws s3 cp source.zip s3://nabz-staging-build-554433963412/source.zip --profile nabz
   C=$(git rev-parse HEAD)
   aws codebuild start-build --project-name nabz-staging-images --profile nabz \
     --environment-variables-override name=TARGET,value=api,type=PLAINTEXT name=DEPLOYMENT_COMMIT,value=$C,type=PLAINTEXT
   aws codebuild start-build --project-name nabz-staging-images --profile nabz \
     --environment-variables-override name=TARGET,value=web,type=PLAINTEXT name=DEPLOYMENT_COMMIT,value=$C,type=PLAINTEXT \
     name=API_ORIGIN,value=https://tiuh3tvxsa.ap-south-1.awsapprunner.com,type=PLAINTEXT
   ```

3. App Runner deploys each new image automatically, in about 10 minutes. Check that `/api/v1/health` shows the new `deploymentCommit`.

## Infrastructure (Terraform)

- Folder: `terraform/apprunner-staging/`. State is in S3 (`backend.hcl`).
- `staging.auto.tfvars` is loaded automatically. It keeps `create_api = true`, `create_web = true` and the Google client IDs, so a plain `terraform plan` / `apply` can't delete the services or drop Google sign-in.
- **Always run `terraform plan`, read it, and apply that saved plan.** Never apply blind.
- The private uploads bucket has default encryption, public access blocked, CORS for the website's direct uploads, and a rule that deletes unpublished partner uploads (`partner-posts-pending/`) after one day.

## Secrets (where they live)

| Secret | Where |
|---|---|
| MongoDB connection string | AWS Secrets Manager `nabz/staging/MONGODB_URI` (pipe it into a process; never print it) |
| Generated app secrets (JWT etc.) | Secrets Manager, created by Terraform |
| Android release key file | `C:\mrb\keys\nabz-release.jks`, backed up in Secrets Manager `nabz/android/release-keystore` |
| Android key password | Secrets Manager `nabz/android/release-keystore-password` |
| Staging test accounts | `C:\mrb\nabz-test-accounts.txt` (local only, not in git) |

## Android apps

### Build both APKs

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File apk-build.ps1   # wraps C:\mrb\build-cloud.ps1
```

- The script copies `frontends/mobile` and `frontends/shared` to `C:\mrb`.
- It builds **Nabz** (customer) and **Nabz Partner** against the staging API, signs both with the release key, and saves `Nabz.apk` and `Nabz-Partner.apk` to the Desktop. The old APKs are replaced only after both builds succeed.
- It keeps the PC awake while it runs. A full build takes 30–70 minutes; the log is at `C:\mrb\build-cloud.log`.
- To rebuild only one app, call `build-cloud.ps1 -WebUrl <website> -Variants customer` (or `partner`).
- If a screen file is moved or renamed, delete the old copy under `C:\mrb\frontends\mobile\app`. The copy step adds and updates files but never removes them.

### Signing key

- Release key: alias `nabz-release`, RSA 4096.
- SHA-1: `05:84:A4:CE:3B:F9:D1:D1:53:6B:0B:86:81:46:06:BF:29:70:6D:EA`
- SHA-256: `34:3B:32:B8:E6:6C:E0:7F:C5:77:34:15:71:41:CB:96:68:42:1B:AB:59:3A:76:35:39:96:6D:8D:58:22:84:C0`
- The build signs through Gradle's `android.injected.signing.*` settings and reads the password from Secrets Manager at build time.
- **Never lose this key**: Play Store updates and Google sign-in depend on it. When the app moves to the Play Store, enrol in Play App Signing and keep this key as the upload key.

## Google sign-in

Google Cloud project: **Nabz**. The app is in Testing mode, so only accounts listed as **test users** can sign in.

| Client | ID | Settings |
|---|---|---|
| Web | `542534084220-dkulc04guq24btte9vc7b37gom7h2df0.apps.googleusercontent.com` | JavaScript origins: the website URL and `http://localhost:3000` |
| Android | `542534084220-8eh8ru5aeum5in1esendnuv4hlcvbjk3.apps.googleusercontent.com` | Package `app.medrush.mobile`, the SHA-1 above |

- The API accepts ID tokens for both clients (`GOOGLE_OAUTH_CLIENT_IDS`) and gives the website its client ID (`GOOGLE_WEB_CLIENT_ID`).
- **Android** uses native sign-in (`@react-native-google-signin`). The token is issued for the **web** client ID, and Google checks the app's package and signing key against the Android client. Browser redirects with a custom scheme are blocked for new Android clients (Error 400: `invalid_request`).
- **Website** uses Google Identity Services in a popup. The Content Security Policy allows `accounts.google.com/gsi` only.
- **Before launch:** move the consent screen to production. That needs a real domain, a support email and a privacy-policy URL.
- **Pending:** rotate the web client secret that was exposed in a screenshot. Nabz doesn't use it, but rotate it anyway.

## Tests

```bash
# Local MongoDB replica set on port 28017 (rs: testset), then:
MONGODB_URI="mongodb://127.0.0.1:28017/<db>?replicaSet=testset" npx jest <files> --runInBand
npm test        # fast suite (jest.fast.config.js)
npm run lint
```
