
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
export const firebaseConfig = {
  apiKey: "AIzaSyA71ax-mSZvZ0zsd9mNDzRV4gBfa-rYPi4",
  authDomain: "codename-new.firebaseapp.com",
  projectId: "codename-new",
  storageBucket: "codename-new.firebasestorage.app",
  messagingSenderId: "1047929129143",
  appId: "1:1047929129143:web:78d9acf8de262442902532",
  measurementId: "G-2X95Q66Z73"
};

// A more robust way to initialize Firebase, preventing re-initialization.
const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth: Auth = getAuth(app);
const db: Firestore = getFirestore(app);

export { app, auth, db };
