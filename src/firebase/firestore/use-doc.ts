'use client';

import {
  onSnapshot,
  type DocumentReference,
  type DocumentData,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export function useDoc<T>(
  ref: DocumentReference<T> | null
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ref) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    const unsubscribe = onSnapshot(
      ref,
      (doc) => {
        if (doc.exists()) {
          setData({ id: doc.id, ...doc.data() } as T);
        } else {
          setData(null);
        }
        setLoading(false);
      },
      async (error) => {
         const permissionError = new FirestorePermissionError({
            path: ref.path,
            operation: 'get',
        });
        errorEmitter.emit('permission-error', permissionError);

        console.error(`Error fetching document:`, error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [ref?.path]);

  return { data, loading };
}
