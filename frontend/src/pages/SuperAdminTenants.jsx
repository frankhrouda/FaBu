import { useEffect, useState } from 'react';
import {
  ChevronLeft,
  Users,
  Car,
  Calendar,
  Edit2,
  Check,
  X,
  Shield,
  ShieldOff,
  Trash2,
  Plus,
} from 'lucide-react';
import { api } from '../api/client';
import { useToast, ToastContainer } from '../components/Toast';

export default function SuperAdminTenants() {
  const [tenants, setTenants] = useState([]);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [members, setMembers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const { toasts, show, dismiss } = useToast();

  // Editing state
  const [editingName, setEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [updatingUserRole, setUpdatingUserRole] = useState(null);

  // Load all tenants
  useEffect(() => {
    loadTenants();
  }, []);

  const loadTenants = async () => {
    try {
      setLoading(true);
      const result = await api.get('/admin/tenants');
      setTenants(result.tenants || []);
    } catch (err) {
      show({ type: 'error', message: 'Fehler beim Laden der Mandanten' });
    } finally {
      setLoading(false);
    }
  };

  const loadTenantDetails = async (tenantId) => {
    try {
      setDetailLoading(true);
      const [tenantResult, membersResult] = await Promise.all([
        api.get(`/tenants/${tenantId}`),
        api.get(`/admin/tenants/${tenantId}/members`),
      ]);

      setMembers(membersResult.members || []);
      setEditedName(tenantResult.tenant.name);
      
      // Load vehicles for this tenant - filter tenant's vehicles
      try {
        const allVehicles = await api.get(`/vehicles`);
        const tenantVehicles = (Array.isArray(allVehicles) ? allVehicles : [])
          .filter(v => v && v.tenant_id === tenantId) || [];
        setVehicles(tenantVehicles);
      } catch {
        // If vehicles endpoint fails, just show empty list
        setVehicles([]);
      }
    } catch (err) {
      show({ type: 'error', message: 'Fehler beim Laden der Tenant-Details: ' + (err?.message || err) });
      console.error(err);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSelectTenant = (tenant) => {
    setSelectedTenant(tenant);
    setEditingName(false);
    loadTenantDetails(tenant.id);
  };

  const handleSaveName = async () => {
    if (!editedName.trim() || editedName === selectedTenant.name) {
      setEditingName(false);
      return;
    }

    try {
      setSavingName(true);
      const result = await api.patch(`/admin/tenants/${selectedTenant.id}`, {
        name: editedName.trim(),
      });

      setSelectedTenant(result.tenant);
      setTenants(tenants.map(t => t.id === result.tenant.id ? result.tenant : t));
      setEditingName(false);
      show({ type: 'success', message: 'Mandantenname aktualisiert' });
    } catch (err) {
      show({ type: 'error', message: err.message || 'Fehler beim Speichern' });
    } finally {
      setSavingName(false);
    }
  };

  const handleChangeUserRole = async (userId, newRole) => {
    try {
      setUpdatingUserRole(userId);
      const result = await api.patch(`/admin/tenants/${selectedTenant.id}/members/${userId}/role`, {
        role: newRole,
      });

      setMembers(members.map(m => m.id === userId ? result.user : m));
      show({ type: 'success', message: 'Benutzerrolle aktualisiert' });
    } catch (err) {
      show({ type: 'error', message: err.message || 'Fehler beim Aktualisieren der Rolle' });
    } finally {
      setUpdatingUserRole(null);
    }
  };

  if (loading) {
    return (
      <div className="p-4 max-w-4xl mx-auto">
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {!selectedTenant ? (
        // Tenant List View
        <div>
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold">Mandantenverwaltung</h1>
            <button
              onClick={() => {
                // TODO: Implement create tenant
                show({ type: 'info', message: 'Funktion in Arbeit' });
              }}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Neuer Mandant
            </button>
          </div>

          <div className="grid gap-4">
            {tenants.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                Keine Mandanten vorhanden
              </div>
            ) : (
              tenants.map(tenant => (
                <div
                  key={tenant.id}
                  onClick={() => handleSelectTenant(tenant)}
                  className="bg-white border border-gray-200 rounded-lg p-4 cursor-pointer hover:border-indigo-400 hover:shadow-md transition-all"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-semibold">{tenant.name}</h2>
                    <ChevronLeft className="w-5 h-5 text-gray-400 rotate-180" />
                  </div>
                  <div className="grid grid-cols-4 gap-4 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      <span>{tenant.admin_count} Admin{tenant.admin_count !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      <span>{tenant.user_count} Benutzer</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Car className="w-4 h-4" />
                      <span>{tenant.vehicle_count} Fahrzeuge</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      <span>{tenant.reservation_count} Reservierungen</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        // Tenant Detail View
        <div>
          <button
            onClick={() => setSelectedTenant(null)}
            className="mb-6 flex items-center gap-2 px-3 py-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Zurück
          </button>

          {detailLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Tenant Name Section */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold">Mandant: {selectedTenant.name}</h2>
                  {!editingName && (
                    <button
                      onClick={() => setEditingName(true)}
                      className="p-2 text-gray-500 hover:text-indigo-600 transition-colors"
                      title="Bearbeiten"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {editingName && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      placeholder="Mandantenname"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      autoFocus
                    />
                    <button
                      onClick={handleSaveName}
                      disabled={savingName}
                      className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setEditingName(false);
                        setEditedName(selectedTenant.name);
                      }}
                      className="px-3 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Members Section */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Mitglieder
                </h3>

                {members.length === 0 ? (
                  <div className="text-gray-500 text-sm">Keine Mitglieder</div>
                ) : (
                  <div className="space-y-3">
                    {members.map(member => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between p-3 border border-gray-200 rounded-lg"
                      >
                        <div>
                          <div className="font-semibold">{member.name}</div>
                          <div className="text-sm text-gray-500">{member.email}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {member.tenant_role === 'admin' ? (
                            <button
                              onClick={() => handleChangeUserRole(member.id, 'user')}
                              disabled={updatingUserRole === member.id}
                              className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200 disabled:opacity-50 transition-colors flex items-center gap-1"
                            >
                              <Shield className="w-4 h-4" />
                              Admin
                            </button>
                          ) : (
                            <button
                              onClick={() => handleChangeUserRole(member.id, 'admin')}
                              disabled={updatingUserRole === member.id}
                              className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50 transition-colors flex items-center gap-1"
                            >
                              <ShieldOff className="w-4 h-4" />
                              Benutzer
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Vehicles Section */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <Car className="w-5 h-5" />
                  Fahrzeuge
                </h3>

                {vehicles.length === 0 ? (
                  <div className="text-gray-500 text-sm">Keine Fahrzeuge</div>
                ) : (
                  <div className="space-y-3">
                    {vehicles.map(vehicle => (
                      <div
                        key={vehicle.id}
                        className="flex items-center justify-between p-3 border border-gray-200 rounded-lg"
                      >
                        <div>
                          <div className="font-semibold">{vehicle.name}</div>
                          <div className="text-sm text-gray-500">{vehicle.license_plate}</div>
                        </div>
                        <div className="text-sm text-gray-600">
                          {vehicle.type}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
