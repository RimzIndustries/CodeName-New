
// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA71ax-mSZvZ0zsd9mNDzRV4gBfa-rYPi4",
  authDomain: "codename-new.firebaseapp.com",
  projectId: "codename-new",
  storageBucket: "codename-new.firebasestorage.app",
  messagingSenderId: "1047929129143",
  appId: "1:1047929129143:web:78d9acf8de262442902532",
  measurementId: "G-2X95Q66Z73"
};

// Initialize Firebase
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Initialize Analytics only if it's supported in the browser
if (typeof window !== 'undefined') {
  isSupported().then(supported => {
    if (supported) {
      getAnalytics(app);
    }
  });
}

export { app, auth, db };
