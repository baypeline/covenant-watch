'use client';

import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useServerInsertedHTML } from 'next/navigation';
import { type ReactNode, useState } from 'react';
import { GlobalStyles } from '@/styles/GlobalStyles';

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 2_000, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  }));
  const [{ cache, flush }] = useState(createEmotionCache);

  useServerInsertedHTML(() => {
    const names = flush();
    if (names.length === 0) return null;
    const rules = names.map((name) => cache.inserted[name]).filter(Boolean).join('');
    return (
      <style
        data-emotion={`${cache.key} ${names.join(' ')}`}
        dangerouslySetInnerHTML={{ __html: rules }}
      />
    );
  });

  return (
    <CacheProvider value={cache}>
      <GlobalStyles />
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </CacheProvider>
  );
}

function createEmotionCache() {
  const cache = createCache({ key: 'cw' });
  cache.compat = true;
  const inserted: string[] = [];
  const previousInsert = cache.insert;
  cache.insert = (...args) => {
    const serialized = args[1];
    if (cache.inserted[serialized.name] === undefined) inserted.push(serialized.name);
    return previousInsert(...args);
  };
  return { cache, flush: () => inserted.splice(0, inserted.length) };
}
