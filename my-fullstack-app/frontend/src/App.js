import React, { useState, useEffect } from 'react';

function App() {
  // --- STATE LAYER MANAGEMENT ---
  const [token, setToken] = useState(localStorage.getItem('userSessionAuthToken') || '');
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);

  // Form Field Inputs
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [taskFormError, setTaskFormError] = useState('');

  // Filtering and Searching States
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All'); // Restored missing filter state

  // Login Fallbacks
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authErrorDisplay, setAuthErrorDisplay] = useState('');

  const [showList, setShowList] = useState(true);

  // --- COMPONENT DID MOUNT / LOAD DATA ---
  useEffect(() => {
    if (!token) return;

    setLoading(true);
    fetch('/tasks', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    })
    .then(res => {
      if (res.status === 401 || res.status === 403) {
        handleLogoutSignal();
        throw new Error('Session expired or invalid.');
      }
      return res.json();
    })
    .then(data => {
      if (data && !data.error) {
        setTasks(data);
      }
      setLoading(false);
    })
    .catch(err => {
      console.error("Failed to load tasks:", err);
      setLoading(false);
    });
  }, [token]);

  // --- ACTION ENGINE CONTEXT HANDLERS ---
  const handleLoginSubmit = (e) => {
    e.preventDefault();
    setAuthErrorDisplay('');

    if (!loginUsername.trim() || !loginPassword.trim()) {
      setAuthErrorDisplay('Please enter both username and password.');
      return;
    }

    fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: loginUsername.trim(), password: loginPassword })
    })
    .then(async response => {
      const parsedResData = await response.json();
      if (!response.ok) throw new Error(parsedResData.error || 'Authentication failure.');
      return parsedResData;
    })
    .then(data => {
      if (data.token) {
        localStorage.setItem('userSessionAuthToken', data.token);
        setToken(data.token);
        setLoginUsername('');
        setLoginPassword('');
      }
    })
    .catch(err => setAuthErrorDisplay(err.message));
  };

  const handleCreateTaskSubmit = (e) => {
    e.preventDefault();
    setTaskFormError('');

    if (!title.trim()) {
      setTaskFormError('Validation Error: Task title is mandatory.');
      return;
    }

    fetch('/tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ title: title.trim(), description: description.trim() })
    })
    .then(async res => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create task.');
      return data;
    })
    .then(createdData => {
      // Prepend to array state instantly for visual update
      setTasks(prevTasks => [createdData, ...prevTasks]);
      setTitle('');
      setDescription('');
    })
    .catch(err => {
      setTaskFormError(err.message);
      alert(`Backend Error: ${err.message}`);
    });
  };

  const handleStatusUpdateChange = (taskId, statusValueTarget) => {
    fetch(`/tasks/${taskId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ status: statusValueTarget })
    })
    .then(res => res.json())
    .then(updatedPayload => {
      if (updatedPayload && !updatedPayload.error) {
        setTasks(prev => prev.map(task => task.id === taskId ? { ...task, status: statusValueTarget } : task));
      }
    });
  };

  const handleTaskDeleteClick = (taskId) => {
    fetch(`/tasks/${taskId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    .then(res => res.json())
    .then(data => {
      if (!data.error) {
        setTasks(prev => prev.filter(task => task.id !== taskId));
      }
    });
  };

  const handleLogoutSignal = () => {
    localStorage.removeItem('userSessionAuthToken');
    setToken('');
    setTasks([]);
  };

  // --- FILTRATION AND SEARCH PROCESSING LOGIC ---
  const filteredTasks = tasks.filter(task => {
    const matchesStatus = statusFilter === 'All' || task.status === statusFilter;
    const matchesSearch =
      (task.title && task.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (task.description && task.description.toLowerCase().includes(searchTerm.toLowerCase()));

    return matchesStatus && matchesSearch;
  });

  // --- DYNAMIC RENDERING INTERFACES ---
  if (!token) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f0f2f5' }}>
        <div style={{ background: '#fff', padding: '40px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', width: '100%', maxWidth: '400px', fontFamily: 'Segoe UI, sans-serif' }}>
          <h2 style={{ textAlign: 'center', marginBottom: '24px', color: '#333' }}>System Gateway</h2>
          {authErrorDisplay && <p style={{ color: '#721c24', background: '#f8d7da', padding: '10px', borderRadius: '4px', fontSize: '0.9em', border: '1px solid #f5c6cb' }}>{authErrorDisplay}</p>}
          <form onSubmit={handleLoginSubmit}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#555' }}>Username</label>
              <input type="text" value={loginUsername} onChange={e => setLoginUsername(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#555' }}>Password</label>
              <input type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
            </div>
            <button type="submit" style={{ width: '100%', padding: '12px', background: '#007bff', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1em', fontWeight: 'bold' }}>Login</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '30px 20px', maxWidth: '700px', margin: '0 auto', fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif', color: '#333' }}>

      {/* Header Profile Area */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', borderBottom: '2px solid #eaeaea', paddingBottom: '15px' }}>
        <h2 style={{ margin: 0, color: '#222' }}>🚀 Task Dashboard Workspace</h2>
        <button onClick={handleLogoutSignal} style={{ padding: '8px 16px', background: '#dc3545', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600' }}>Logout</button>
      </div>

      {/* Task Creation Form Card */}
      <form onSubmit={handleCreateTaskSubmit} style={{ background: '#ffffff', padding: '20px', borderRadius: '8px', marginBottom: '30px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #e1e4e8' }}>
        <h3 style={{ marginTop: 0, marginBottom: '15px', color: '#0056b3' }}>Create New Task</h3>
        {taskFormError && <p style={{ color: '#dc3545', fontSize: '0.9em', background: '#fdf2f2', padding: '8px', borderRadius: '4px' }}>{taskFormError}</p>}

        <div style={{ marginBottom: '12px' }}>
          <input
            placeholder="Task Title (Required)"
            value={title}
            onChange={e => setTitle(e.target.value)}
            style={{ width: '100%', padding: '12px', borderRadius: '4px', border: '1px solid #ced4da', boxSizing: 'border-box', fontSize: '1em' }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <textarea
            placeholder="Task Description details (Optional)..."
            value={description}
            onChange={e => setDescription(e.target.value)}
            style={{ width: '100%', padding: '12px', borderRadius: '4px', border: '1px solid #ced4da', boxSizing: 'border-box', height: '90px', fontSize: '1em', resize: 'vertical' }}
          />
        </div>

        <button type="submit" style={{ padding: '10px 24px', background: '#28a745', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1em' }}>Add Task</button>
      </form>

      {/* Control Filters Group */}
      <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', flexWrap: 'wrap', background: '#f8f9fa', padding: '15px', borderRadius: '6px', border: '1px solid #e9ecef' }}>
        <div style={{ flex: 2, minWidth: '200px' }}>
          <input
            type="text"
            placeholder="🔍 Search tasks by title or content..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ced4da', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ flex: 1, minWidth: '130px' }}>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ced4da', background: '#fff', cursor: 'pointer' }}
          >
            <option value="All">All Statuses</option>
            <option value="To Do">To Do</option>
            <option value="In Progress">In Progress</option>
            <option value="Done">Done</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <button onClick={() => setShowList(!showList)} style={{ padding: '6px 14px', cursor: 'pointer', background: '#6c757d', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: '600' }}>
          {showList ? "👁️ Hide List View" : "👁️ Show List View"}
        </button>
        <span style={{ fontSize: '0.9em', color: '#6c757d' }}>Showing {filteredTasks.length} task(s)</span>
      </div>

      {/* Task List Rendering View Grid */}
      {loading ? <p style={{ textAlign: 'center', color: '#666' }}>Fetching records from storage engine cache...</p> : showList && (
        <ul style={{ listStyleType: 'none', padding: 0, margin: 0 }}>
          {filteredTasks.map(task => (
            <li key={task.id} style={{ padding: '18px', border: '1px solid #e1e4e8', marginBottom: '12px', borderRadius: '6px', background: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', transition: 'transform 0.2s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', gap: '10px' }}>
                <strong style={{ fontSize: '1.15em', color: '#1b1f23', wordBreak: 'break-word' }}>{task.title}</strong>

                <select
                  value={task.status}
                  onChange={(e) => handleStatusUpdateChange(task.id, e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #ced4da', background: '#f8f9fa', fontWeight: '600', cursor: 'pointer' }}
                >
                  <option value="To Do">To Do</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Done">Done</option>
                </select>
              </div>

              <p style={{ color: '#586069', margin: '0 0 15px 0', fontSize: '1em', lineHeight: '1.5', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                {task.description || <span style={{ color: '#aaa', fontStyle: 'italic' }}>No additional description details provided.</span>}
              </p>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => handleTaskDeleteClick(task.id)}
                  style={{ padding: '6px 14px', background: '#fff', color: '#cb2431', border: '1px solid #d1d5da', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9em', fontWeight: '600', transition: 'all 0.2s' }}
                  onMouseEnter={(e) => { e.target.style.background = '#cb2431'; e.target.style.color = '#fff'; }}
                  onMouseLeave={(e) => { e.target.style.background = '#fff'; e.target.style.color = '#cb2431'; }}
                >
                  Delete Task
                </button>
              </div>
            </li>
          ))}
          {filteredTasks.length === 0 && (
            <p style={{ color: '#6a737d', textAlign: 'center', fontStyle: 'italic', padding: '30px', background: '#f8f9fa', borderRadius: '6px', border: '1px solid #e1e4e8' }}>
              No tasks matched your search or status selection context.
            </p>
          )}
        </ul>
      )}
    </div>
  );
}

export default App;