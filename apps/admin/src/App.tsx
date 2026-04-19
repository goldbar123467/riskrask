import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={
              <main className="min-h-screen bg-slate-900 p-8 text-slate-100">
                <h1 className="text-3xl font-semibold">Riskrask admin</h1>
                <p className="mt-2 text-slate-400">Scaffold — dashboard arrives with Track G.</p>
              </main>
            }
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
