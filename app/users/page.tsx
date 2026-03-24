'use client';

import { useState, useEffect } from 'react';
import AlertModal from '../../components/ui/AlertModal';
import { apiFetch } from '../../lib/apiClient';

interface User {
  id: string;
  email: string;
  name?: string;
  role?: string;
  created_at: string;
  last_sign_in_at: string;
}

interface UserFormData {
  email: string;
  name: string;
  role: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [passwordUser, setPasswordUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const [formData, setFormData] = useState<UserFormData>({
    email: '',
    name: '',
    role: 'Viewer'
  });

  const [showAlert, setShowAlert] = useState<{
    isOpen: boolean;
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
  }>({
    isOpen: false,
    type: 'info',
    title: '',
    message: ''
  });

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setIsLoading(true);
      
      const response = await apiFetch('/api/users');
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load users');
      }
      
      setUsers(data.users);
    } catch (error: any) {
      console.error('Error loading users:', error);
      setShowAlert({
        isOpen: true,
        type: 'error', 
        title: 'Error Loading Users',
        message: error.message || 'Failed to load users. Please try again.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormChange = (field: keyof UserFormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateEmail(formData.email)) {
      setShowAlert({
        isOpen: true,
        type: 'error',
        title: 'Invalid Email',
        message: 'Please enter a valid email address.'
      });
      return;
    }

    try {
      setIsSubmitting(true);

      const response = await apiFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email.trim().toLowerCase(),
          name: formData.name,
          role: formData.role,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to invite user');
      }

      setShowAlert({
        isOpen: true,
        type: 'success',
        title: 'User Invited',
        message: `Invitation sent to ${formData.email}. They will receive an email with a magic link to sign in.`
      });

      // Reset form
      setFormData({
        email: '',
        name: '',
        role: 'Viewer'
      });
      setShowAddForm(false);
      
      // Reload users
      loadUsers();

    } catch (error: any) {
      console.error('Error inviting user:', error);
      setShowAlert({
        isOpen: true,
        type: 'error',
        title: 'Error Inviting User',
        message: error.message || 'Failed to invite user. Please try again.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditForm = (user: User) => {
    setEditingUser(user);
    setFormData({
      email: user.email,
      name: user.name || '',
      role: user.role || 'Viewer'
    });
    setShowEditForm(true);
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!editingUser) return;

    if (!validateEmail(formData.email)) {
      setShowAlert({
        isOpen: true,
        type: 'error',
        title: 'Invalid Email',
        message: 'Please enter a valid email address.'
      });
      return;
    }

    try {
      setIsSubmitting(true);

      const response = await apiFetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingUser.id,
          email: formData.email,
          name: formData.name,
          role: formData.role,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update user');
      }

      setShowAlert({
        isOpen: true,
        type: 'success',
        title: 'User Updated',
        message: `User ${formData.email} has been successfully updated.`
      });

      // Reset form
      setFormData({
        email: '',
        name: '',
        role: 'Viewer'
      });
      setShowEditForm(false);
      setEditingUser(null);
      
      // Reload users
      loadUsers();

    } catch (error: any) {
      console.error('Error updating user:', error);
      setShowAlert({
        isOpen: true,
        type: 'error',
        title: 'Error Updating User',
        message: error.message || 'Failed to update user. Please try again.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendAccess = async (email: string) => {
    try {
      setIsSubmitting(true);
      const response = await apiFetch('/api/users/resend-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to send access link');
      setShowAlert({
        isOpen: true,
        type: 'success',
        title: 'Access Link Sent',
        message: data.message,
      });
    } catch (error: any) {
      setShowAlert({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: error.message || 'Failed to send access link.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordUser) return;
    if (newPassword.length < 8) {
      setShowAlert({ isOpen: true, type: 'error', title: 'Too Short', message: 'Password must be at least 8 characters.' });
      return;
    }
    try {
      setIsSubmitting(true);
      const response = await apiFetch(`/api/users/${passwordUser.id}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to set password');
      setPasswordUser(null);
      setNewPassword('');
      setShowPassword(false);
      setShowAlert({ isOpen: true, type: 'success', title: 'Password Set', message: `Password updated for ${passwordUser.email}.` });
    } catch (error: any) {
      setShowAlert({ isOpen: true, type: 'error', title: 'Error', message: error.message || 'Failed to set password.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    if (!confirm(`Are you sure you want to delete user "${email}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setIsSubmitting(true);

      const response = await apiFetch(`/api/users?id=${userId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete user');
      }

      setShowAlert({
        isOpen: true,
        type: 'success',
        title: 'User Deleted',
        message: `User ${email} has been successfully deleted.`
      });
      
      // Reload users
      loadUsers();

    } catch (error: any) {
      console.error('Error deleting user:', error);
      setShowAlert({
        isOpen: true,
        type: 'error',
        title: 'Error Deleting User',
        message: error.message || 'Failed to delete user. Please try again.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">User Management</h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Add new users and manage user passwords
              </p>
            </div>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              Add New User
            </button>
          </div>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200">
                Passwordless Authentication
              </h3>
              <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
                This system uses magic links for secure, password-free sign-in. When you invite a user, they'll receive an email with a link to access the system. Access is invite-only.
              </p>
            </div>
          </div>
        </div>

        {/* Add User Form */}
        {showAddForm && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-8">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white">Invite New User</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                User will receive a magic link via email to sign in. No password required.
              </p>
            </div>
            <form onSubmit={handleAddUser} className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={formData.email}
                    onChange={(e) => handleFormChange('email', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="user@example.com"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Full Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleFormChange('name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <label htmlFor="role" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Role
                  </label>
                  <select
                    id="role"
                    value={formData.role}
                    onChange={(e) => handleFormChange('role', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="Viewer">Viewer</option>
                    <option value="ACPD">ACPD</option>
                  </select>
                </div>
              </div>
              
              <div className="mt-6 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setFormData({ email: '', name: '', role: 'Viewer' });
                  }}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSubmitting ? 'Sending Invite...' : 'Send Invite'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Edit User Form */}
        {showEditForm && editingUser && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-8">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white">Edit User</h2>
            </div>
            <form onSubmit={handleEditUser} className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="edit-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    id="edit-email"
                    value={formData.email}
                    onChange={(e) => handleFormChange('email', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="user@example.com"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="edit-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Full Name
                  </label>
                  <input
                    type="text"
                    id="edit-name"
                    value={formData.name}
                    onChange={(e) => handleFormChange('name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="John Doe"
                  />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="edit-role" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Role
                  </label>
                  <select
                    id="edit-role"
                    value={formData.role}
                    onChange={(e) => handleFormChange('role', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="Viewer">Viewer</option>
                    <option value="ACPD">ACPD</option>
                  </select>
                </div>
              </div>
              
              <div className="mt-6 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditForm(false);
                    setEditingUser(null);
                    setFormData({ email: '', name: '', role: 'Viewer' });
                  }}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSubmitting ? 'Updating...' : 'Update User'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Users Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white">System Users</h2>
          </div>
          
          {isLoading ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Loading users...</p>
            </div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-500 dark:text-gray-400">No users found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Last Sign In
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                        {user.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {user.name || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          user.role === 'ACPD' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' :
                          'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                        }`}>
                          {user.role || 'Viewer'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {formatDate(user.created_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {user.last_sign_in_at ? formatDate(user.last_sign_in_at) : 'Never'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                        <button onClick={() => openEditForm(user)} disabled={isSubmitting}
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 transition-colors">
                          Edit
                        </button>
                        <button onClick={() => { setPasswordUser(user); setNewPassword(''); setShowPassword(false); }} disabled={isSubmitting}
                          className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 transition-colors">
                          Set Password
                        </button>
                        <button onClick={() => handleResendAccess(user.email)} disabled={isSubmitting}
                          className="text-green-600 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300 transition-colors">
                          Resend Access
                        </button>
                        <button onClick={() => handleDeleteUser(user.id, user.email)} disabled={isSubmitting}
                          className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 transition-colors">
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Set Password Modal */}
      {passwordUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-5">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Set Password</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{passwordUser.email}</p>
            </div>
            <form onSubmit={handleSetPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">New password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    autoFocus
                    className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                  <button type="button" onClick={() => setShowPassword(p => !p)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    {showPassword
                      ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                      : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    }
                  </button>
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setPasswordUser(null); setNewPassword(''); setShowPassword(false); }}
                  className="flex-1 py-2 px-4 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={isSubmitting || !newPassword}
                  className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  {isSubmitting ? 'Saving…' : 'Set Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Alert Modal */}
      <AlertModal
        isOpen={showAlert.isOpen}
        onClose={() => setShowAlert(prev => ({ ...prev, isOpen: false }))}
        type={showAlert.type}
        title={showAlert.title}
        message={showAlert.message}
      />
    </div>
  );
}
