import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Home } from './routes/Home';
import { Lobby } from './routes/Lobby';
import { Play } from './routes/Play';
import { Replay } from './routes/Replay';
import { Setup } from './routes/Setup';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: false } },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/lobby" element={<Lobby />} />
          <Route path="/lobby/:roomId" element={<Lobby />} />
          <Route path="/play" element={<Play />} />
          <Route path="/play/:roomId" element={<Play />} />
          <Route path="/replay/:id" element={<Replay />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
