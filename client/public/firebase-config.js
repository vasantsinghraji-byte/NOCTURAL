// Firebase Configuration Module
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, query, where, onSnapshot, updateDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Firebase configuration - CORRECT WORKING CONFIG
const firebaseConfig = {
    apiKey: "AIzaSyAqfLJumqjAVp6RLueUhSlORk6x7OTDXUY",
    authDomain: "nocturnal-49be3.firebaseapp.com",
    projectId: "nocturnal-49be3",
    storageBucket: "nocturnal-49be3.firebasestorage.app",
    messagingSenderId: "936577924059",
    appId: "1:936577924059:web:384b5e88afbe81b849c5fe",
    measurementId: "G-PGHXQ52KC4"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Export Firebase services
export {
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

// Make available globally for non-module scripts
window.firebaseAuth = auth;
window.firebaseDb = db;
window.firebaseSignOut = signOut;
