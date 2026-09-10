import { useAuth } from '../../../context/useAuth.js';

export interface HeaderProps {
  readonly currentRouteName?: string;
  readonly onProductionClick?: () => void;
  readonly onRecipesClick?: () => void;
  readonly onHomeClick?: () => void;
}

export function Header({
  currentRouteName,
  onProductionClick,
  onRecipesClick,
  onHomeClick,
}: HeaderProps) {
  const { user, selectedBusiness, selectedRole, signOut } = useAuth();

  const isProductionActive = currentRouteName === 'production-day' || currentRouteName === 'production-run';
  const isRecipesActive = currentRouteName?.startsWith('recipe');

  const roleLabel: Record<'owner' | 'admin' | 'member', string> = {
    owner: 'Propietario',
    admin: 'Administrador',
    member: 'Miembro',
  };

  const roleBadgeStyle: Record<'owner' | 'admin' | 'member', string> = {
    owner: 'bg-amber-100 text-amber-800 border-amber-300',
    admin: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    member: 'bg-stone-100 text-stone-700 border-stone-300',
  };

  return (
    <header className="bg-white border-b border-stone-200 sticky top-0 z-20 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={onHomeClick ?? onProductionClick}
            className="flex items-center gap-2.5 cursor-pointer group text-left min-h-[44px]"
            title="Ir a Producción"
          >
            <div className="w-8 h-8 rounded-lg bg-amber-600 text-white flex items-center justify-center font-bold text-lg shadow-xs group-hover:bg-amber-700 transition-colors">
              C
            </div>
            <div>
              <span className="font-bold text-stone-900 tracking-tight text-lg group-hover:text-amber-700 transition-colors">
                Costara
              </span>
            </div>
          </button>

          {/* Main Navigation Links */}
          <nav className="flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={onProductionClick}
              className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors min-h-[44px] cursor-pointer flex items-center ${
                isProductionActive
                  ? 'bg-amber-50 text-amber-900 border border-amber-200/80 shadow-xs font-bold'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
              }`}
            >
              Producción
            </button>
            <button
              type="button"
              onClick={onRecipesClick}
              className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors min-h-[44px] cursor-pointer flex items-center ${
                isRecipesActive
                  ? 'bg-amber-50 text-amber-900 border border-amber-200/80 shadow-xs font-bold'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
              }`}
            >
              Recetas
            </button>
          </nav>

          {selectedBusiness && (
            <div className="hidden lg:flex items-center gap-2 border-l border-stone-200 pl-6 text-sm text-stone-600">
              <span className="font-medium text-stone-800">{selectedBusiness.name}</span>
              <span className="text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full border border-stone-200">
                {selectedBusiness.currency_code} · {selectedBusiness.timezone}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right text-xs hidden sm:block">
            <p className="font-medium text-stone-800">{user?.email}</p>
            <span
              className={`inline-block mt-0.5 px-2 py-0.2 rounded-full border text-[11px] font-medium ${roleBadgeStyle[selectedRole] || roleBadgeStyle.member}`}
            >
              {roleLabel[selectedRole] || selectedRole}
            </span>
          </div>

          <button
            type="button"
            onClick={() => signOut()}
            className="text-xs text-stone-500 hover:text-stone-800 font-medium px-3 py-2 rounded-lg border border-stone-200 hover:bg-stone-50 transition-colors cursor-pointer min-h-[44px] flex items-center"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </header>
  );
}
