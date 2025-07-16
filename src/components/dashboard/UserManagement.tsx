import React, { useState } from "react";
import { Plus, Edit, Trash2, User, Shield } from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { User as UserType } from "../../types";

const UserManagement: React.FC = () => {
  const { users, addUser, updateUser, deleteUser } = useCollection();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserType | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    login: "",
    password: "",
    type: "collector" as "manager" | "collector",
  });

  const handleOpenModal = (user?: UserType) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        name: user.name,
        login: user.login,
        password: "", // Don't show existing password
        type: user.type,
      });
    } else {
      setEditingUser(null);
      setFormData({
        name: "",
        login: "",
        password: "",
        type: "collector",
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingUser(null);
    setFormData({
      name: "",
      login: "",
      password: "",
      type: "collector",
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (editingUser) {
      const updates: Partial<UserType> = {
        name: formData.name,
        login: formData.login,
        type: formData.type,
      };

      // Only update password if provided
      if (formData.password.trim()) {
        updates.password = formData.password;
      }

      updateUser(editingUser.id, updates);
    } else {
      addUser(formData);
    }

    handleCloseModal();
  };

  const handleOpenDeleteModal = (user: UserType) => {
    setUserToDelete(user);
    setIsDeleteModalOpen(true);
  };

  const handleCloseDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setUserToDelete(null);
  };

  const handleConfirmDelete = () => {
    if (userToDelete) {
      deleteUser(userToDelete.id);
      handleCloseDeleteModal();
    }
  };

  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div className="page-header">
          <div>
            <h2 className="text-xl lg:text-2xl font-bold text-gray-900 flex items-center-title">
              Gerenciamento de Usuários
            </h2>
            <p className="page-subtitle">
              {users.length} usuário{users.length !== 1 ? "s" : ""} cadastrado
              {users.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button onClick={() => handleOpenModal()} className="btn-primary">
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Novo Usuário</span>
          </button>
        </div>

        {/* Users List - Responsive */}
        <div className="container-main">
          {/* Desktop Table */}
          <div className="hidden md:block">
            <div className="table-container">
              <table className="table-base">
                <thead className="table-header">
                  <tr>
                    <th className="table-header-cell">Usuário</th>
                    <th className="table-header-cell">Login</th>
                    <th className="table-header-cell">Tipo</th>
                    <th className="table-header-cell">Criado em</th>
                    <th className="table-header-cell">Ações</th>
                  </tr>
                </thead>
                <tbody className="table-body">
                  {users.map((user) => (
                    <tr key={user.id} className="table-row">
                      <td className="table-cell">
                        <div className="flex items-center">
                          <div className="h-10 w-10 bg-gray-100 rounded-full flex items-center justify-center mr-3">
                            <User className="h-5 w-5 text-gray-600" />
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">
                              {user.name}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="text-gray-900">{user.login}</div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center">
                          {user.type === "manager" ? (
                            <Shield className="h-4 w-4 text-purple-600 mr-2" />
                          ) : (
                            <User className="h-4 w-4 text-blue-600 mr-2" />
                          )}
                          <span
                            className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              user.type === "manager"
                                ? "bg-purple-100 text-purple-800"
                                : "bg-blue-100 text-blue-800"
                            }`}
                          >
                            {user.type === "manager" ? "Gerente" : "Cobrador"}
                          </span>
                        </div>
                      </td>
                      <td className="table-cell">
                        <div className="text-muted">
                          {new Date(user.createdAt).toLocaleDateString("pt-BR")}
                        </div>
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleOpenModal(user)}
                            className="btn-action btn-action-blue"
                            title="Editar"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleOpenDeleteModal(user)}
                            className="btn-action btn-action-red"
                            title="Excluir"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-4">
            {users.map((user) => (
              <div
                key={user.id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-4"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center">
                    <div className="h-12 w-12 bg-gray-100 rounded-full flex items-center justify-center mr-3">
                      <User className="h-6 w-6 text-gray-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 text-lg">
                        {user.name}
                      </h3>
                      <p className="text-gray-600 text-sm">@{user.login}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleOpenModal(user)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Editar"
                    >
                      <Edit className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => handleOpenDeleteModal(user)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Excluir"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    {user.type === "manager" ? (
                      <Shield className="h-4 w-4 text-purple-600 mr-2" />
                    ) : (
                      <User className="h-4 w-4 text-blue-600 mr-2" />
                    )}
                    <span
                      className={`inline-flex px-3 py-1 text-sm font-medium rounded-full ${
                        user.type === "manager"
                          ? "bg-purple-100 text-purple-800"
                          : "bg-blue-100 text-blue-800"
                      }`}
                    >
                      {user.type === "manager" ? "Gerente" : "Cobrador"}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500">
                    {new Date(user.createdAt).toLocaleDateString("pt-BR")}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {users.length === 0 && (
            <div className="empty-state">
              <div className="text-gray-500">
                <div className="empty-state-icon-container">
                  <div className="empty-state-icon-bg">
                    <User className="empty-state-icon" />
                  </div>
                </div>
                <h3 className="empty-state-title">Nenhum usuário encontrado</h3>
                <p className="empty-state-description">
                  Comece adicionando um novo usuário ao sistema.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* User Modal */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-container max-w-md mx-4">
            <div className="modal-header">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingUser ? "Editar Usuário" : "Novo Usuário"}
              </h3>
            </div>

            <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nome
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Login
                </label>
                <input
                  type="text"
                  value={formData.login}
                  onChange={(e) =>
                    setFormData({ ...formData, login: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {editingUser
                    ? "Nova Senha (deixe em branco para manter a atual)"
                    : "Senha"}
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required={!editingUser}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tipo de Usuário
                </label>
                <select
                  value={formData.type}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      type: e.target.value as "manager" | "collector",
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="collector">Cobrador</option>
                  <option value="manager">Gerente</option>
                </select>
              </div>

              <div className="flex flex-col sm:flex-row sm:justify-end space-y-2 sm:space-y-0 sm:space-x-3 pt-4">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="w-full sm:w-auto px-4 py-3 sm:py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-center"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto px-4 py-3 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-center"
                >
                  {editingUser ? "Atualizar" : "Criar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && userToDelete && (
        <div className="modal-overlay">
          <div className="modal-container max-w-sm mx-4">
            <div className="p-6">
              <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-red-100 rounded-full">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>

              <h3 className="text-lg font-semibold text-gray-900 text-center mb-2">
                Excluir Usuário
              </h3>

              <p className="text-gray-600 text-center mb-6">
                Tem certeza que deseja excluir o usuário{" "}
                <strong>{userToDelete.name}</strong>? Esta ação não pode ser
                desfeita.
              </p>

              <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3">
                <button
                  type="button"
                  onClick={handleCloseDeleteModal}
                  className="w-full px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Excluir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default UserManagement;
