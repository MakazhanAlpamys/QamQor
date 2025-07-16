import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { FaUser, FaEdit, FaSignOutAlt } from 'react-icons/fa';
import '../../styles/ProfilePage.css';
// Импортируем логотипы
import logo from '../../img/logo.jpg';
import logo2 from '../../img/logo2.png';

const ProfilePage = () => {
  const { user, logout, updateProfile } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Format date to display
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('kk-KZ', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };
  
  const handleEditClick = () => {
    setIsEditing(true);
    setSuccess('');
    setError('');
  };
  
  const handleCancelEdit = () => {
    setIsEditing(false);
    setName(user?.name || '');
    setError('');
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError('Аты-жөні қажет');
      return;
    }
    
    try {
      setLoading(true);
      setError('');
      
      await updateProfile({ name });
      setIsEditing(false);
      setSuccess('Профиль сәтті жаңартылды');
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccess('');
      }, 3000);
    } catch (err) {
      console.error('Profile update error:', err);
      setError(err.response?.data?.message || 'Профильді жаңарту кезінде қате орын алды');
    } finally {
      setLoading(false);
    }
  };
  
  const handleLogout = () => {
    logout();
  };
  
  if (!user) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Жүктелуде...</p>
      </div>
    );
  }
  
  return (
    <div className="profile-page">
      <div className="profile-header">
        <div className="profile-avatar">
          <FaUser />
        </div>
        <h1>Профиль</h1>
      </div>
      
      {error && <div className="profile-error">{error}</div>}
      {success && <div className="profile-success">{success}</div>}
      
      <div className="profile-card">
        {isEditing ? (
          <form className="profile-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="name">Аты-жөні</label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Аты-жөніңізді енгізіңіз"
              />
            </div>
            
            <div className="profile-actions">
              <button 
                type="button" 
                className="cancel-button"
                onClick={handleCancelEdit}
                disabled={loading}
              >
                Болдырмау
              </button>
              <button 
                type="submit" 
                className="save-button"
                disabled={loading}
              >
                {loading ? 'Сақталуда...' : 'Сақтау'}
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="profile-info">
              <div className="info-item">
                <span className="info-label">Аты-жөні:</span>
                <span className="info-value">{user.name}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Email:</span>
                <span className="info-value">{user.email}</span>
              </div>
              {/* Временно скрыто из-за проблемы с форматом даты
              <div className="info-item">
                <span className="info-label">Тіркелген күні:</span>
                <span className="info-value">{formatDate(user.created_at)}</span>
              </div>
              */}
            </div>
            
            <button 
              className="edit-button"
              onClick={handleEditClick}
            >
              <FaEdit />
              <span>Профильді өңдеу</span>
            </button>
          </>
        )}
      </div>
      
      <div className="logos-container">
        <div className="logo-box">
          <img src={logo} alt="QamQor Logo" className="profile-logo" />
          <img src={logo2} alt="Assyl AI Logo" className="profile-logo" />
        </div>
      </div>
      
      <button 
        className="logout-button"
        onClick={handleLogout}
      >
        <FaSignOutAlt />
        <span>Шығу</span>
      </button>
    </div>
  );
};

export default ProfilePage; 
