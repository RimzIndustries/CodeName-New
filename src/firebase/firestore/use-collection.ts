'use client';

import {
  onSnapshot,
  type CollectionReference,
  type Query,
  type DocumentData,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export function useCollection<T>(
  query: Query<T> | CollectionReference<T> | null
) {
  const [data, setData] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!query) {
      setData([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const unsubscribe = onSnapshot(
      query,
      (snapshot) => {
        const data = snapshot.docs.map(
          (doc) =>
            ({
              id: doc.id,
              ...doc.data(),
            } as T)
        );
        setData(data);
        setLoading(false);
      },
      async (error) => {
        const permissionError = new FirestorePermissionError({
            path: (query as Query).path,
            operation: 'list',
        });
        errorEmitter.emit('permission-error', permissionError);

        console.error(`Error fetching collection:`, error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [JSON.stringify(query)]); // Simple serialization for dependency array

  return { data, loading };
}
