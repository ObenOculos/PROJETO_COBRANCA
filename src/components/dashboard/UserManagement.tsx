import React, { useMemo, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  User,
  Shield,
  Ban,
  CheckCircle,
  Gauge,
  Target,
  Search,
  Users as UsersIcon,
} from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { useAuth } from "../../contexts/AuthContext";
import {
  CollectorOverdueRange,
  User as UserType,
  UserType as UserRoleType,
  isCollectorType,
} from "../../types";
import ClearVisitsModal, { pendingVisitsCount } from "./ClearVisitsModal";
import { USER_TYPE_LABELS, isWalletCollectorType } from "../../config/profiles";
import { todayLocalStr } from "../../config/visitStatus";
import { formatCurrencyCompact } from "../../utils/formatters";
import FaixaEquipeModal from "./FaixaEquipeModal";
import MonthlyGoalEditModal from "./MonthlyGoalEditModal";

const TYPE_BADGE_CLASS: Record<UserRoleType, string> = {
  manager:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  collector: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  internal_collector:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  third_party_collector:
    "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  legal_collector:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
};

// Ordem dos filtros por perfil e da lista (gestores primeiro, depois as
// modalidades de cobranca).
const TYPE_ORDER: UserRoleType[] = [
  "manager",
  "collector",
  "internal_collector",
  "third_party_collector",
  "legal_collector",
];

const inputClass =
  "w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-dark-bg dark:border-dark-border dark:text-dark-text";

const iconButtonClass =
  "p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors dark:text-dark-text-secondary dark:hover:bg-dark-bg dark:hover:text-dark-text";

/** "1–60 dias", "90+ dias". */
/** Resumo das regras da carteira do cobrador: "3–60 dias · 2 lojas" ou
 * "2 faixas". */
const regrasLabel = (regras: CollectorOverdueRange[]) => {
  const ativas = regras.filter((r) => r.ativa).length;
  if (regras.length > 1)
    return `${regras.length} faixas${ativas < regras.length ? ` (${ativas} ativa${ativas === 1 ? "" : "s"})` : ""}`;
  if (!regras[0].ativa) return "1 faixa inativa";
  const r = regras[0];
  const faixa = r.maxDias == null ? `${r.minDias}+ dias` : `${r.minDias}–${r.maxDias} dias`;
  if (r.lojas == null) return faixa;
  return `${faixa} · ${r.lojas.length === 1 ? r.lojas[0] : `${r.lojas.length} lojas`}`;
};

const regrasTitulo = (regras: CollectorOverdueRange[]) =>
  regras
    .map(
      (r) =>
        `${r.maxDias == null ? `${r.minDias}+` : `${r.minDias} a ${r.maxDias}`} dias${r.ativa ? "" : " (inativa)"}: ${r.lojas?.join(", ") ?? "todas as lojas"}`,
    )
    .join("\n");

// Gestao de usuarios: cada linha mostra direto o que o gestor configura de
// cada cobrador (faixa de atraso, gestor responsavel, meta do mes) e cada
// valor abre o seu modal de edicao -- antes tudo ficava escondido num menu
// "..." sem mostrar o valor atual.
interface UserManagementProps {
  /** Abre a tela Distribuicao da carteira (onde a regra faixa x lojas e
   * editada -- centralizada la, nao no cadastro do usuario). */
  onOpenDistribuicao?: () => void;
}

const UserManagement: React.FC<UserManagementProps> = ({
  onOpenDistribuicao,
}) => {
  const {
    users,
    addUser,
    updateUser,
    deleteUser,
    scheduledVisits,
    collectorOverdueRanges,
    managerCollectorLinks,
    monthlyGoals,
    refreshCollections,
  } = useCollection();
  const { user: currentUser } = useAuth();
  const [clearVisitsFor, setClearVisitsFor] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserType | null>(null);
  const [faixaEquipeFor, setFaixaEquipeFor] = useState<UserType | null>(null);
  const [metaFor, setMetaFor] = useState<UserType | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<UserRoleType | "all">("all");
  const [showInactive, setShowInactive] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    login: "",
    type: "collector" as UserRoleType,
  });

  const handleToggleActive = async (u: UserType) => {
    const isDeactivating = u.active ?? true; // estado atual ativo => vamos desativar
    try {
      await updateUser(u.id, { active: !isDeactivating });
      // Desativar cobrador libera a carteira dele no banco (gatilho
      // trg_users_libera_carteira_ao_inativar, migration 20261109000004):
      // recarrega os clientes para a tela refletir.
      if (isDeactivating && isCollectorType(u.type)) {
        await refreshCollections();
      }
      // Ao desativar um cobrador com visitas pendentes, oferece limpá-las.
      if (
        isDeactivating &&
        isCollectorType(u.type) &&
        pendingVisitsCount(scheduledVisits, u.id) > 0
      ) {
        setClearVisitsFor({ id: u.id, name: u.name });
      }
    } catch (err) {
      console.error("Erro ao (des)ativar usuário:", err);
    }
  };

  const handleOpenModal = (user?: UserType) => {
    setLocalError(null);
    if (user) {
      setEditingUser(user);
      setFormData({
        name: user.name,
        login: user.login,
        type: user.type,
      });
    } else {
      setEditingUser(null);
      setFormData({ name: "", login: "", type: "collector" });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingUser(null);
    setLocalError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    try {
      if (editingUser) {
        const updates: Partial<UserType> = {
          name: formData.name,
          login: formData.login,
          type: formData.type,
        };
        await updateUser(editingUser.id, updates);
      } else {
        await addUser(formData);
      }
      handleCloseModal();
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : "Erro ao salvar usuário",
      );
    }
  };

  const handleOpenDeleteModal = (user: UserType) => {
    setUserToDelete(user);
    setLocalError(null);
    setIsDeleteModalOpen(true);
  };

  const handleCloseDeleteModal = () => {
    if (isDeleting) return;
    setIsDeleteModalOpen(false);
    setUserToDelete(null);
    setLocalError(null);
  };

  const handleConfirmDelete = async () => {
    if (userToDelete) {
      setIsDeleting(true);
      setLocalError(null);
      try {
        await deleteUser(userToDelete.id);
        setIsDeleting(false);
        handleCloseDeleteModal();
      } catch (err) {
        setIsDeleting(false);
        setLocalError(
          err instanceof Error
            ? err.message
            : "Este usuário não pode ser excluído pois possui registros vinculados (clientes, pagamentos ou visitas).",
        );
      }
    }
  };

  // Mes corrente no formato de monthly_goals.month (YYYY-MM-01).
  const currentMonth = `${todayLocalStr().slice(0, 7)}-01`;

  const regrasByCollector = useMemo(() => {
    const m = new Map<string, CollectorOverdueRange[]>();
    collectorOverdueRanges.forEach((r) => {
      if (!m.has(r.collectorId)) m.set(r.collectorId, []);
      m.get(r.collectorId)!.push(r);
    });
    m.forEach((l) => l.sort((a, b) => a.minDias - b.minDias));
    return m;
  }, [collectorOverdueRanges]);
  const managerNameByCollector = useMemo(() => {
    const names = new Map(users.map((u) => [u.id, u.name]));
    return new Map(
      managerCollectorLinks.map((l) => [l.collectorId, names.get(l.managerId)]),
    );
  }, [managerCollectorLinks, users]);
  const goalByCollector = useMemo(
    () =>
      new Map(
        monthlyGoals
          .filter((g) => g.month?.slice(0, 10) === currentMonth)
          .map((g) => [g.user_id, g]),
      ),
    [monthlyGoals, currentMonth],
  );

  const inactiveCount = users.filter((u) => u.active === false).length;

  const visibleUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users
      .filter((u) => showInactive || u.active !== false)
      .filter((u) => typeFilter === "all" || u.type === typeFilter)
      .filter(
        (u) =>
          !term ||
          u.name.toLowerCase().includes(term) ||
          u.login.toLowerCase().includes(term),
      )
      .sort(
        (a, b) =>
          TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) ||
          Number(a.active === false) - Number(b.active === false) ||
          a.name.localeCompare(b.name),
      );
  }, [users, search, typeFilter, showInactive]);

  const countByType = useMemo(() => {
    const counts = new Map<UserRoleType, number>();
    users
      .filter((u) => showInactive || u.active !== false)
      .forEach((u) => counts.set(u.type, (counts.get(u.type) ?? 0) + 1));
    return counts;
  }, [users, showInactive]);
  const totalShown = Array.from(countByType.values()).reduce((a, b) => a + b, 0);

  const filterPillClass = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors whitespace-nowrap ${
      active
        ? "bg-blue-600 text-white border-blue-600"
        : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50 dark:bg-dark-bg dark:text-dark-text-secondary dark:border-dark-border"
    }`;

  const emptyChipClass =
    "inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border border-dashed border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-600 transition-colors dark:border-dark-border";
  const valueChipClass =
    "inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors dark:bg-dark-bg dark:text-dark-text";

  return (
    <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-200 dark:border-dark-border p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text">
            Usuários
          </h2>
          <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
            {users.length - inactiveCount} ativo
            {users.length - inactiveCount !== 1 ? "s" : ""}
            {inactiveCount > 0 && ` · ${inactiveCount} inativo${inactiveCount !== 1 ? "s" : ""}`}
            . Clique na faixa, no gestor ou na meta para editar (a faixa
            abre a Distribuição da carteira).
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="w-full sm:w-auto flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          <Plus className="h-4 w-4 mr-2" />
          Novo Usuário
        </button>
      </div>

      {/* Busca e filtros */}
      <div className="space-y-3 mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou login"
              className={`${inputClass} pl-9`}
            />
          </div>
          {inactiveCount > 0 && (
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-dark-text-secondary cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="rounded border-gray-300"
              />
              Mostrar inativos ({inactiveCount})
            </label>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setTypeFilter("all")}
            className={filterPillClass(typeFilter === "all")}
          >
            Todos ({totalShown})
          </button>
          {TYPE_ORDER.filter((t) => (countByType.get(t) ?? 0) > 0).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={filterPillClass(typeFilter === t)}
            >
              {USER_TYPE_LABELS[t]} ({countByType.get(t)})
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {visibleUsers.length > 0 ? (
        <div className="border border-gray-200 dark:border-dark-border rounded-xl overflow-hidden">
          <div className="hidden lg:grid grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_auto] gap-4 px-4 py-2.5 bg-gray-50 dark:bg-dark-bg text-xs font-semibold text-gray-500 dark:text-dark-text-secondary uppercase tracking-wide">
            <span>Usuário</span>
            <span>Perfil</span>
            <span>Faixa de atraso</span>
            <span>Gestor</span>
            <span>Meta do mês</span>
            <span className="text-right">Ações</span>
          </div>
          <ul className="divide-y divide-gray-100 dark:divide-dark-border">
            {visibleUsers.map((user) => {
              const isCollector = isCollectorType(user.type);
              const regras = regrasByCollector.get(user.id) ?? [];
              const gestor = managerNameByCollector.get(user.id);
              const goal = goalByCollector.get(user.id);
              const goalUnit = isWalletCollectorType(user.type)
                ? "atend."
                : "visitas";
              const inactive = user.active === false;
              return (
                <li
                  key={user.id}
                  className={`grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_auto] gap-3 lg:gap-4 px-4 py-3 lg:items-center ${
                    inactive ? "bg-gray-50/70 dark:bg-dark-bg/40" : ""
                  }`}
                >
                  {/* Usuário */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 shrink-0 bg-gray-100 dark:bg-dark-bg rounded-full flex items-center justify-center">
                      {user.type === "manager" ? (
                        <Shield className="h-4 w-4 text-gray-600 dark:text-dark-text-secondary" />
                      ) : (
                        <User className="h-4 w-4 text-gray-600 dark:text-dark-text-secondary" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div
                        className={`font-semibold truncate ${inactive ? "text-gray-400" : "text-gray-900 dark:text-dark-text"}`}
                        title={user.name}
                      >
                        {user.name}
                      </div>
                      <div
                        className="text-xs text-gray-500 dark:text-dark-text-secondary truncate"
                        title={user.login}
                      >
                        Login: {user.login}
                      </div>
                    </div>
                  </div>

                  {/* Perfil */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${TYPE_BADGE_CLASS[user.type] ?? TYPE_BADGE_CLASS.collector}`}
                    >
                      {USER_TYPE_LABELS[user.type] ?? "Cobrador"}
                    </span>
                    {inactive && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-600 dark:bg-dark-bg dark:text-dark-text-secondary">
                        <Ban className="h-3 w-3 mr-1" /> Inativo
                      </span>
                    )}
                  </div>

                  {/* Faixa / Gestor / Meta: só cobrador */}
                  {isCollector ? (
                    <>
                      <div className="flex items-center gap-2 lg:block">
                        <span className="lg:hidden text-xs text-gray-400 w-24 shrink-0">
                          Faixa
                        </span>
                        <button
                          type="button"
                          onClick={() => onOpenDistribuicao?.()}
                          className={`${regras.length ? valueChipClass : emptyChipClass} max-w-full`}
                          title={
                            regras.length
                              ? `${regrasTitulo(regras)}\nEditar em Distribuição da carteira.`
                              : "Definir em Distribuição da carteira"
                          }
                        >
                          <Gauge className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">
                            {regras.length ? regrasLabel(regras) : "Definir"}
                          </span>
                        </button>
                      </div>
                      <div className="flex items-center gap-2 lg:block min-w-0">
                        <span className="lg:hidden text-xs text-gray-400 w-24 shrink-0">
                          Gestor
                        </span>
                        <button
                          type="button"
                          onClick={() => setFaixaEquipeFor(user)}
                          className={`${gestor ? valueChipClass : emptyChipClass} max-w-full`}
                          title="Editar gestor responsável"
                        >
                          <UsersIcon className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{gestor ?? "Definir"}</span>
                        </button>
                      </div>
                      <div className="flex items-center gap-2 lg:block">
                        <span className="lg:hidden text-xs text-gray-400 w-24 shrink-0">
                          Meta do mês
                        </span>
                        <button
                          type="button"
                          onClick={() => setMetaFor(user)}
                          className={goal ? valueChipClass : emptyChipClass}
                          title="Editar meta mensal"
                        >
                          <Target className="h-3.5 w-3.5" />
                          {goal
                            ? `${goal.visits_goal} ${goalUnit} · ${formatCurrencyCompact(goal.payments_goal)}`
                            : "Definir"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="hidden lg:block text-xs text-gray-300">—</span>
                      <span className="hidden lg:block text-xs text-gray-300">—</span>
                      <span className="hidden lg:block text-xs text-gray-300">—</span>
                    </>
                  )}

                  {/* Ações */}
                  <div className="flex items-center justify-end gap-1 border-t border-gray-100 dark:border-dark-border pt-2 lg:border-0 lg:pt-0">
                    <button
                      type="button"
                      onClick={() => handleOpenModal(user)}
                      className={iconButtonClass}
                      title="Editar nome, login e perfil"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    {currentUser?.id !== user.id && (
                      <button
                        type="button"
                        onClick={() => handleToggleActive(user)}
                        className={`${iconButtonClass} ${inactive ? "hover:!text-green-600" : "hover:!text-amber-600"}`}
                        title={inactive ? "Ativar" : "Desativar"}
                      >
                        {inactive ? (
                          <CheckCircle className="h-4 w-4" />
                        ) : (
                          <Ban className="h-4 w-4" />
                        )}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleOpenDeleteModal(user)}
                      className={`${iconButtonClass} hover:!text-red-600`}
                      title="Excluir"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-dark-bg">
            <User className="h-6 w-6 text-gray-500" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-dark-text">
            Nenhum usuário encontrado
          </h3>
          <p className="mt-2 text-sm text-gray-600 dark:text-dark-text-secondary">
            {users.length > 0
              ? "Nenhum usuário com esses filtros."
              : "Comece adicionando um novo usuário ao sistema."}
          </p>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200 dark:border-dark-border">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text">
                {editingUser ? "Editar Usuário" : "Novo Usuário"}
              </h3>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {localError && (
                <div className="p-3 bg-red-100 text-red-700 text-sm rounded-md">
                  {localError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                  Nome
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                  Login
                </label>
                <input
                  type="text"
                  value={formData.login}
                  onChange={(e) =>
                    setFormData({ ...formData, login: e.target.value })
                  }
                  className={inputClass}
                  required
                />
              </div>
              {!editingUser && (
                <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-md p-2 dark:bg-dark-bg dark:border-dark-border dark:text-dark-text-secondary">
                  Isto cria só o perfil. O acesso de login (senha) é
                  provisionado separadamente — avise quem administra o
                  sistema para liberar o acesso deste usuário.
                </p>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                  Perfil
                </label>
                <select
                  value={formData.type}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      type: e.target.value as UserRoleType,
                    })
                  }
                  className={inputClass}
                >
                  {TYPE_ORDER.map((t) => (
                    <option key={t} value={t}>
                      {USER_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-dark-bg dark:border-dark-border dark:text-dark-text-secondary"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {editingUser ? "Atualizar" : "Criar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isDeleteModalOpen && userToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-xl max-w-sm w-full p-6">
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                <Trash2 className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-dark-text">
                Excluir Usuário
              </h3>
              <p className="mt-2 text-sm text-gray-600 dark:text-dark-text-secondary">
                Tem certeza que deseja excluir{" "}
                <strong>{userToDelete.name}</strong>? Esta ação não pode ser
                desfeita. Para só bloquear o acesso, use Desativar.
              </p>
              {localError && (
                <div className="mt-4 p-3 bg-red-100 text-red-700 text-sm rounded-md text-left">
                  {localError}
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button
                type="button"
                onClick={handleCloseDeleteModal}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-dark-bg dark:border-dark-border dark:text-dark-text-secondary"
                disabled={isDeleting}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                disabled={isDeleting}
              >
                {isDeleting ? "Excluindo..." : "Excluir"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ao desativar um cobrador: oferece limpar as visitas pendentes dele */}
      {clearVisitsFor && (
        <ClearVisitsModal
          collectorId={clearVisitsFor.id}
          collectorName={clearVisitsFor.name}
          onClose={() => setClearVisitsFor(null)}
        />
      )}

      {faixaEquipeFor && (
        <FaixaEquipeModal
          collector={faixaEquipeFor}
          onClose={() => setFaixaEquipeFor(null)}
        />
      )}

      <MonthlyGoalEditModal
        isOpen={!!metaFor}
        onClose={() => setMetaFor(null)}
        collector={metaFor}
      />
    </div>
  );
};

export default UserManagement;
