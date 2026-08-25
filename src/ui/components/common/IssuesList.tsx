import type { CalculationIssue } from '../../../domain/calculation/types.js';
import { formatCalculationIssue } from '../../../lib/issueMessages.js';

export interface IssuesListProps {
  readonly issues: readonly CalculationIssue[];
  readonly compact?: boolean;
}

export function IssuesList({ issues, compact = false }: IssuesListProps) {
  if (!issues || issues.length === 0) return null;

  const severityStyles = {
    error: {
      bg: 'bg-red-50 border-red-200 text-red-900',
      badge: 'bg-red-100 text-red-800 border-red-300',
      icon: 'text-red-600',
    },
    warning: {
      bg: 'bg-amber-50 border-amber-200 text-amber-900',
      badge: 'bg-amber-100 text-amber-800 border-amber-300',
      icon: 'text-amber-600',
    },
    info: {
      bg: 'bg-blue-50 border-blue-200 text-blue-900',
      badge: 'bg-blue-100 text-blue-800 border-blue-300',
      icon: 'text-blue-600',
    },
  };

  if (compact) {
    return (
      <div className="space-y-1.5">
        {issues.map((issue, idx) => {
          const display = formatCalculationIssue(issue);
          const style = severityStyles[display.severity] || severityStyles.warning;
          return (
            <div
              key={`${issue.code}_${issue.itemId || ''}_${idx}`}
              className={`text-xs px-3 py-2 rounded-lg border flex items-start gap-2 ${style.bg}`}
            >
              <span className="font-semibold">{display.title}:</span>
              <span>{display.message}</span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {issues.map((issue, idx) => {
        const display = formatCalculationIssue(issue);
        const style = severityStyles[display.severity] || severityStyles.warning;

        return (
          <div
            key={`${issue.code}_${issue.itemId || ''}_${idx}`}
            className={`p-4 rounded-xl border flex items-start gap-3.5 shadow-xs ${style.bg}`}
          >
            <div className="mt-0.5 shrink-0">
              {display.severity === 'error' && (
                <svg className={`w-5 h-5 ${style.icon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              {display.severity === 'warning' && (
                <svg className={`w-5 h-5 ${style.icon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              )}
              {display.severity === 'info' && (
                <svg className={`w-5 h-5 ${style.icon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-semibold text-sm">{display.title}</h4>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${style.badge}`}>
                  {display.severity === 'error' ? 'Bloqueante' : display.severity === 'warning' ? 'Advertencia' : 'Información'}
                </span>
              </div>
              <p className="text-xs mt-1 text-stone-700 leading-relaxed">{display.message}</p>
              {display.actionHint && (
                <p className="text-xs mt-1.5 font-medium text-stone-600">
                  <span className="text-stone-400">Sugerencia:</span> {display.actionHint}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
