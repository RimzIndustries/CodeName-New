'use client';

import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { useAuth, useFirestore, useDoc } from '@/firebase';
import type { UserProfile } from '@/context/AuthContext';

export function useUser() {
  const auth = useAuth();
  const db = useFirestore();
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoadingUser(false);
    });
    return () => unsubscribe();
  }, [auth]);

  const userDocRef = user ? doc(db, 'users', user.uid) : null;
  const { data: userProfile, loading: loadingProfile } = useDoc<UserProfile>(userDocRef);

  return {
    user,
    userProfile,
    loading: loadingUser || loadingProfile,
  };
}
