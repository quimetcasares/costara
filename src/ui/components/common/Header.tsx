import { useAuth } from '../../../context/useAuth.js';

export interface HeaderProps {
  readonly onHomeClick?: () => void;
}

export function Header({ onHomeClick }: HeaderProps) {
  const { user, selectedBusiness, selectedRole, signOut } = useAuth();

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
            onClick={onHomeClick}
            className="flex items-center gap-2 cursor-pointer group text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-amber-600 text-white flex items-center justify-center font-bold text-lg shadow-xs group-hover:bg-amber-700 transition-colors">
              C
            </div>
            <div>
              <span className="font-bold text-stone-900 tracking-tight text-lg group-hover:text-amber-700 transition-colors">
                Costara
              </span>
              <span className="hidden sm:inline-block ml-2 text-xs text-stone-400 font-normal">
                Costeo y Formulación
              </span>
            </div>
          </button>

          {selectedBusiness && (
            <div className="hidden md:flex items-center gap-2 border-l border-stone-200 pl-6 text-sm text-stone-600">
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
            className="text-xs text-stone-500 hover:text-stone-800 font-medium px-3 py-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 transition-colors cursor-pointer"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </header>
  );
}
