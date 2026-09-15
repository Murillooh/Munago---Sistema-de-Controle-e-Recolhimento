import { ActiveTab, AuthUser } from '../types';

// "dashboard" é sempre liberado (tela de pouso — ninguém pode ficar sem
// nenhuma aba acessível). "usuarios" é sempre admin-only, não é
// configurável pelo próprio admin — senão ele conseguiria se tirar (ou tirar
// todo mundo) do único lugar que dá pra corrigir permissão depois.
export function canAccessTab(user: AuthUser | null, tab: ActiveTab): boolean {
  if (!user) return false;
  if (tab === 'dashboard') return true;
  if (tab === 'usuarios') return user.role === 'admin';
  if (user.role === 'admin') return true;
  if (!user.allowedTabs) return true; // sem restrição configurada = acesso total
  return user.allowedTabs.includes(tab);
}
