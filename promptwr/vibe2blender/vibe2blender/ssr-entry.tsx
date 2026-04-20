import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { App } from './src/App';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

export function render(url: string) {
  // Normalize paths from Vite SSR crawler
  const normalizedUrl = (url === '200.html' || url === 'index.html') ? '/' : url;

  return renderToString(
    <QueryClientProvider client={queryClient}>
      <StaticRouter location={normalizedUrl}>
        <App />
      </StaticRouter>
    </QueryClientProvider>
  );
}

export default render;