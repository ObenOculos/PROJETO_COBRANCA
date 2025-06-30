import { RefreshCw } from 'lucide-react';
import { useCollection } from '../contexts/CollectionContext';
import { useAuth } from '../contexts/AuthContext';
import { TestSupabase } from './TestSupabase';

export function DebugCollector() {
  const { collections, getCollectorCollections, refreshData, loading } = useCollection();
  const { user } = useAuth();

  const handleRefresh = async () => {
    console.log('🔄 Forçando refresh dos dados...');
    await refreshData();
  };

  if (!user || user.type !== 'collector') {
    return null;
  }

  const myCollections = getCollectorCollections(user.id);
  const allCollectionsWithUserId = collections.filter(c => c.user_id);
  const myCollectionsByUserId = collections.filter(c => c.user_id === user.id);

  return (
    <div>
      <TestSupabase />
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-yellow-800">🐛 Debug Info - Cobrador</h3>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="flex items-center px-3 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div>
          <h4 className="font-medium text-yellow-700">Informações do Usuário:</h4>
          <ul className="mt-2 space-y-1">
            <li><strong>ID:</strong> {user.id}</li>
            <li><strong>Nome:</strong> {user.name}</li>
            <li><strong>Tipo:</strong> {user.type}</li>
          </ul>
        </div>

        <div>
          <h4 className="font-medium text-yellow-700">Estatísticas Gerais:</h4>
          <ul className="mt-2 space-y-1">
            <li><strong>Total Collections:</strong> {collections.length}</li>
            <li><strong>Collections com user_id:</strong> {allCollectionsWithUserId.length}</li>
            <li><strong>Minhas Collections (user_id):</strong> {myCollectionsByUserId.length}</li>
            <li><strong>Via getCollectorCollections:</strong> {myCollections.length}</li>
          </ul>
        </div>
      </div>

      {myCollectionsByUserId.length > 0 && (
        <div className="mt-4">
          <h4 className="font-medium text-yellow-700">Exemplos de Collections Atribuídas:</h4>
          <div className="mt-2 max-h-32 overflow-y-auto">
            {myCollectionsByUserId.slice(0, 3).map((collection, index) => (
              <div key={index} className="text-xs bg-white p-2 rounded mb-1">
                <strong>{collection.cliente}</strong> - Doc: {collection.documento} - 
                Valor: R$ {collection.valor_original} - user_id: {collection.user_id}
              </div>
            ))}
          </div>
        </div>
      )}

      {allCollectionsWithUserId.length > 0 && (
        <div className="mt-4">
          <h4 className="font-medium text-yellow-700">IDs de Cobradores com Atribuições:</h4>
          <div className="text-xs">
            {Array.from(new Set(allCollectionsWithUserId.map(c => c.user_id))).join(', ')}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}