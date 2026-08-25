import { useState } from 'react';
import { useAuth } from './context/useAuth.js';
import { supabase } from './lib/supabaseClient.js';
import { Header } from './ui/components/common/Header.js';
import { useNavigation } from './ui/hooks/useNavigation.js';
import { RecipeListView } from './ui/views/RecipeListView.js';
import { RecipeDetailView } from './ui/views/RecipeDetailView.js';
import { RecipeDraftEditorView } from './ui/views/RecipeDraftEditorView.js';
import { RecipeHistoryView } from './ui/views/RecipeHistoryView.js';

export default function App() {
  const { user, selectedBusiness, selectedRole, loading, error: authError, signIn } = useAuth();
  const { route, toList, toDetail, toDraft, toHistory } = useNavigation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setSubmitting(true);
    try {
      await signIn(email, password);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setLocalError(err.message);
      } else {
        setLocalError('Authentication failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const fillCredentials = (userEmail: string) => {
    setEmail(userEmail);
    setPassword('password123');
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-stone-900 text-stone-100 flex items-center justify-center p-6 font-sans">
        <div className="text-stone-400 font-medium animate-pulse text-sm">
          Cargando sesión de Costara...
        </div>
      </main>
    );
  }

  if (!user || !selectedBusiness) {
    return (
      <main className="min-h-screen bg-stone-900 text-stone-100 flex flex-col items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full space-y-6 rounded-2xl bg-stone-850 p-8 border border-stone-800 shadow-2xl">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-600 text-white font-bold text-2xl shadow-md">
              C
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">Costara</h1>
            <p className="text-xs text-stone-400">Vertical Slice M1D: Recetas, Costeo y Versionado</p>
          </div>

          {(localError || authError) && (
            <div className="p-3 text-xs text-red-400 bg-red-950/50 border border-red-800/60 rounded-lg">
              {localError || authError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1">Correo electrónico</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="a@costara.local"
                className="w-full px-3 py-2 text-sm bg-stone-950 border border-stone-800 rounded-lg focus:outline-hidden focus:border-amber-500 text-stone-100 placeholder-stone-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1">Contraseña</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 text-sm bg-stone-950 border border-stone-800 rounded-lg focus:outline-hidden focus:border-amber-500 text-stone-100 placeholder-stone-600"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs rounded-lg shadow-md transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {submitting ? 'Iniciando sesión...' : 'Iniciar sesión'}
            </button>
          </form>

          {/* Quick Demo Login Preset Buttons */}
          <div className="pt-4 border-t border-stone-800 space-y-2">
            <span className="block text-[11px] text-stone-500 text-center font-medium">
              Usuarios de prueba rápida:
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => fillCredentials('a@costara.local')}
                className="py-1.5 px-2 bg-stone-800/80 hover:bg-stone-800 border border-stone-700 rounded-lg text-[11px] font-medium text-stone-300 transition-colors text-center cursor-pointer"
              >
                Owner (Panadería)
              </button>
              <button
                type="button"
                onClick={() => fillCredentials('member@costara.local')}
                className="py-1.5 px-2 bg-stone-800/80 hover:bg-stone-800 border border-stone-700 rounded-lg text-[11px] font-medium text-stone-300 transition-colors text-center cursor-pointer"
              >
                Member (Lectura)
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const businessId = selectedBusiness.id;
  const userRole = selectedRole || 'member';
  const businessTimezone = selectedBusiness.timezone || 'America/Mexico_City';

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900 flex flex-col font-sans">
      <Header onHomeClick={toList} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {route.name === 'recipe-list' && (
          <RecipeListView
            supabase={supabase}
            businessId={businessId}
            onSelectRecipe={(id) => toDetail(id)}
          />
        )}

        {route.name === 'recipe-detail' && (
          <RecipeDetailView
            supabase={supabase}
            businessId={businessId}
            recipeId={route.recipeId}
            userRole={userRole}
            businessTimezone={businessTimezone}
            onBack={toList}
            onGoToDraft={() => toDraft(route.recipeId)}
            onGoToHistory={() => toHistory(route.recipeId)}
          />
        )}

        {route.name === 'recipe-draft' && (
          <RecipeDraftEditorView
            supabase={supabase}
            businessId={businessId}
            recipeId={route.recipeId}
            businessTimezone={businessTimezone}
            onBack={() => toDetail(route.recipeId)}
            onPublished={() => toDetail(route.recipeId)}
          />
        )}

        {route.name === 'recipe-history' && (
          <RecipeHistoryView
            supabase={supabase}
            businessId={businessId}
            recipeId={route.recipeId}
            onBack={() => toDetail(route.recipeId)}
          />
        )}

        {route.name === 'not-found' && (
          <div className="bg-white rounded-xl border border-stone-200 p-12 text-center space-y-4">
            <h3 className="text-lg font-bold text-stone-900">Página no encontrada</h3>
            <p className="text-xs text-stone-500">
              La dirección solicitada no existe o no es válida.
            </p>
            <button
              type="button"
              onClick={toList}
              className="text-xs font-semibold px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors cursor-pointer"
            >
              Volver al catálogo de recetas
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
