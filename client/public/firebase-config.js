/*
 * Deprecated legacy Firebase module.
 *
 * Production authentication now uses backend-issued JWTs only.
 * This module remains as a quarantine stub for any stale imports and should
 * not be used for active auth flows.
 */

const DEPRECATED_MESSAGE =
  'Firebase auth has been retired. Use backend JWT auth via /api/v1/auth/* instead.';

const throwDeprecatedError = () => {
  throw new Error(DEPRECATED_MESSAGE);
};

const auth = null;
const db = null;
const signOut = throwDeprecatedError;
const createUserWithEmailAndPassword = throwDeprecatedError;
const signInWithEmailAndPassword = throwDeprecatedError;
const doc = throwDeprecatedError;
const setDoc = throwDeprecatedError;
const getDoc = throwDeprecatedError;
const collection = throwDeprecatedError;
const addDoc = throwDeprecatedError;
const query = throwDeprecatedError;
const where = throwDeprecatedError;
const onSnapshot = throwDeprecatedError;
const updateDoc = throwDeprecatedError;
const getDocs = throwDeprecatedError;

const onAuthStateChanged = () => () => {};

if (typeof window !== 'undefined') {
  window.__NOCTURNAL_LEGACY_FIREBASE_CONFIG_DISABLED__ = true;
}

export {
  DEPRECATED_MESSAGE,
  auth,
  db,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
  updateDoc,
  getDocs
};
