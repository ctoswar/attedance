import React, { useState, useEffect, useRef } from 'react';
import { Camera, Thermometer, Users, Activity, Clock, AlertCircle, CheckCircle, Settings, Play, Pause, Save, Download, Wifi, WifiOff, Zap, Shield, Eye, TrendingUp } from 'lucide-react';

const AttendanceMonitorDashboard = () => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [currentTemp, setCurrentTemp] = useState(null);
  const [ambientTemp, setAmbientTemp] = useState(null);
  const [facesDetected, setFacesDetected] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [sensorStatus, setSensorStatus] = useState('unknown');
  const [cameraType, setCameraType] = useState('unknown');
  const [stats, setStats] = useState({
    totalRecords: 0,
    highTempCount: 0,
    avgBodyTemp: 0,
    avgAmbientTemp: 0
  });
  const [settings, setSettings] = useState({
    autoCapture: true,
    tempThreshold: 37.5,
    captureInterval: 5
  });
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState('live');
  const [lastError, setLastError] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const pollingIntervalRef = useRef(null);
  const recordPollingIntervalRef = useRef(null);

  // Initialize system status check
  useEffect(() => {
    checkSystemStatus();
  }, []);

  const checkSystemStatus = async () => {
    try {
      const response = await fetch('http://192.168.75.104:8000/system_status/');
      const data = await response.json();
      
      if (data.status === 'success') {
        setSensorStatus(data.sensor_type || 'mock');
        setCameraType(data.camera_type || 'unknown');
        setConnectionStatus('connected');
        setLastError(null);
        
        console.log('System Status:', {
          sensor: data.sensor_type,
          camera: data.camera_type,
          sensorInitialized: data.sensor_initialized
        });
      }
    } catch (error) {
      console.error('Error checking system status:', error);
      setConnectionStatus('error');
      setLastError('Failed to connect to camera system');
    }
  };

  // Function to fetch attendance records from the backend
  const fetchAttendanceRecords = async () => {
    try {
        const response = await fetch('http://192.168.75.104:8000/records/');
        const data = await response.json();
        
        if (data.status === 'success') {
            // Update attendance records directly from the records array
            setAttendanceRecords(data.records || []);
            
            // Update stats if statistics are included in the response
            if (data.statistics) {
                setStats({
                    totalRecords: data.statistics.total_records || 0,
                    highTempCount: data.statistics.high_temp_count || 0,
                    avgBodyTemp: data.statistics.avg_body_temp || 0,
                    avgAmbientTemp: data.statistics.avg_ambient_temp || 0
                });
            }
        } else {
            console.error('Failed to fetch records:', data.message);
            setLastError(data.message || 'Failed to load attendance records');
        }
    } catch (error) {
        console.error('Error fetching attendance records:', error);
        setLastError('Network error while fetching records');
    }
};
  // Update existing useEffect to include record fetching
  useEffect(() => {
    // Fetch records when component mounts
    fetchAttendanceRecords();

    // Set up periodic refresh
    recordPollingIntervalRef.current = setInterval(fetchAttendanceRecords, 30000); // Every 30 seconds

    // Cleanup interval on component unmount
    return () => {
      if (recordPollingIntervalRef.current) {
        clearInterval(recordPollingIntervalRef.current);
      }
    };
  }, []);

  const pollServer = async () => {
    try {
      const response = await fetch('http://192.168.75.104:8000/latest_frame/');
      const data = await response.json();
      
      if (data.status === 'success') {
        // Handle temperature data with null checks
        if (data.body_temperature !== null && data.body_temperature !== undefined) {
          setCurrentTemp(data.body_temperature);
        } else {
          // If sensor is mock, generate some test data
          if (sensorStatus === 'mock') {
            setCurrentTemp(36.5 + Math.random() * 2);
          } else {
            setCurrentTemp(null);
          }
        }
        
        if (data.ambient_temperature !== null && data.ambient_temperature !== undefined) {
          setAmbientTemp(data.ambient_temperature);
        } else {
          if (sensorStatus === 'mock') {
            setAmbientTemp(22 + Math.random() * 3);
          } else {
            setAmbientTemp(null);
          }
        }
        
        setFacesDetected(data.faces_detected || 0);
        setConnectionStatus('connected');
        setLastError(null);

        // Handle frame display
        if (data.frame && canvasRef.current) {
          const img = new Image();
          img.src = `data:image/jpeg;base64,${data.frame}`;
          img.onload = () => {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            
            if (videoRef.current) {
              videoRef.current.style.display = 'none';
            }
            canvas.style.display = 'block';
          };
        }

        // Auto capture logic
        if (data.faces_detected > 0 && settings.autoCapture && isMonitoring) {
          setTimeout(() => {
            captureAttendance();
          }, 1000);
        }
      } else {
        console.warn('Server returned error:', data.message);
        setLastError(data.message || 'Server error');
      }
    } catch (error) {
      console.error('Error polling server:', error);
      setConnectionStatus('error');
      setLastError('Connection lost to camera system');
      
      // Fallback: generate mock data if we're in mock mode
      if (sensorStatus === 'mock') {
        setCurrentTemp(36.5 + Math.random() * 2);
        setAmbientTemp(22 + Math.random() * 3);
        setFacesDetected(Math.floor(Math.random() * 3));
      }
    }
  };

  useEffect(() => {
    if (isMonitoring) {
      pollServer();
      pollingIntervalRef.current = setInterval(pollServer, 1000); // Increased to 1 second for better stability
      return () => {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
        }
      };
    } else {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      if (connectionStatus !== 'error') {
        setConnectionStatus('disconnected');
      }
    }
  }, [isMonitoring, settings.autoCapture, sensorStatus]);

  const captureAttendance = async () => {
    try {
      const response = await fetch('http://192.168.75.104:8000/capture/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          autoCapture: settings.autoCapture,
          tempThreshold: settings.tempThreshold
        })
      });
      
      const data = await response.json();
      
      if (data.status === 'success') {
        // Refresh records after successful capture
        fetchAttendanceRecords();
        setLastError(null);
      } else {
        console.error('Capture failed:', data.message);
        setLastError(data.message || 'Capture failed');
      }
    } catch (error) {
      console.error('Error capturing attendance:', error);
      setLastError('Failed to capture attendance');
    }
  };

  // Modify the existing updateStats function to handle potential undefined values
 const updateStats = (records) => {
    const bodyTemps = records
        .filter(r => r.body_temperature !== null && r.body_temperature !== undefined)
        .map(r => r.body_temperature);
    
    const ambientTemps = records
        .filter(r => r.ambient_temperature !== null && r.ambient_temperature !== undefined)
        .map(r => r.ambient_temperature);
    
    const highTempCount = records.filter(r => r.temperature_status === 'High').length;
    
    setStats({
        totalRecords: records.length,
        highTempCount,
        avgBodyTemp: bodyTemps.length > 0 ? bodyTemps.reduce((a, b) => a + b, 0) / bodyTemps.length : 0,
        avgAmbientTemp: ambientTemps.length > 0 ? ambientTemps.reduce((a, b) => a + b, 0) / ambientTemps.length : 0
    });
};
  const toggleMonitoring = () => {
    setIsMonitoring(!isMonitoring);
    if (!isMonitoring) {
      checkSystemStatus(); // Refresh system status when starting
    }
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  // Modify exportData to use the current attendanceRecords
  const exportData = () => {
    const dataStr = JSON.stringify(attendanceRecords, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `attendance_${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const getSensorStatusColor = () => {
    switch (sensorStatus) {
      case 'smbus':
      case 'circuitpython':
        return 'text-green-400';
      case 'mock':
        return 'text-yellow-400';
      default:
        return 'text-red-400';
    }
  };

  const getSensorStatusText = () => {
    switch (sensorStatus) {
      case 'smbus':
        return 'MLX90614 (SMBus)';
      case 'circuitpython':
        return 'MLX90614 (CircuitPython)';
      case 'mock':
        return 'Mock Sensor';
      default:
        return 'No Sensor';
    }
  };

  const tabContent = {
    live: 'Live Monitoring',
    analytics: 'Analytics',
    settings: 'Settings'
  };

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {/* Animated Background with Particles */}
      <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(120,119,198,0.1),rgba(255,255,255,0))]"></div>
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-3/4 left-3/4 w-64 h-64 bg-cyan-500/20 rounded-full blur-3xl animate-pulse delay-500"></div>
        
        {/* Floating Particles */}
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 bg-white/10 rounded-full animate-pulse"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${3 + Math.random() * 2}s`
              }}
            />
          ))}
        </div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto p-6">
        {/* Header with Glassmorphism */}
        <div className="flex justify-between items-center mb-8 p-6 bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl">
          <div className="flex items-center gap-6">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl blur opacity-75 animate-pulse"></div>
              <div className="relative p-4 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl">
                <Camera className="w-10 h-10 text-white" />
              </div>
            </div>
            <div>
              <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
                ThermalVision
              </h1>
              <p className="text-gray-300 text-lg mt-1">Advanced Thermal Monitoring System</p>
              <div className="flex gap-4 mt-2 text-sm">
                <span className="text-gray-400">Camera: <span className="text-blue-400">{cameraType}</span></span>
                <span className="text-gray-400">Sensor: <span className={getSensorStatusColor()}>{getSensorStatusText()}</span></span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Connection Status with Animated Indicator */}
            <div className={`flex items-center gap-3 px-6 py-3 rounded-full backdrop-blur-xl border transition-all duration-500 ${
              connectionStatus === 'connected' 
                ? 'bg-emerald-500/20 border-emerald-400/30 text-emerald-300' 
                : 'bg-red-500/20 border-red-400/30 text-red-300'
            }`}>
              <div className="relative">
                {connectionStatus === 'connected' ? (
                  <Wifi className="w-5 h-5" />
                ) : (
                  <WifiOff className="w-5 h-5" />
                )}
                <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full ${
                  connectionStatus === 'connected' ? 'bg-emerald-400' : 'bg-red-400'
                } animate-ping`}></div>
              </div>
              <span className="font-medium">
                {connectionStatus === 'connected' ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            
            {/* Settings Button */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-4 bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 hover:bg-white/20 transition-all duration-300 hover:scale-105"
            >
              <Settings className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Error Display */}
        {lastError && (
          <div className="mb-6 p-4 bg-red-500/20 backdrop-blur-xl rounded-2xl border border-red-400/30 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <span className="text-red-300">{lastError}</span>
            <button 
              onClick={() => setLastError(null)}
              className="ml-auto text-red-400 hover:text-red-300"
            >
              ×
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-8 p-2 bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10">
          {Object.entries(tabContent).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex-1 py-3 px-6 rounded-xl font-medium transition-all duration-300 ${
                activeTab === key
                  ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg'
                  : 'text-gray-300 hover:text-white hover:bg-white/10'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="mb-8 p-6 bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl">
            <h3 className="text-2xl font-bold mb-6 flex items-center gap-3">
              <Settings className="w-7 h-7 text-blue-400" />
              System Configuration
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-300">Auto Capture Mode</label>
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={settings.autoCapture}
                    onChange={(e) => setSettings({...settings, autoCapture: e.target.checked})}
                    className="sr-only"
                  />
                  <div 
                    className={`w-16 h-8 rounded-full cursor-pointer transition-all duration-300 ${
                      settings.autoCapture 
                        ? 'bg-gradient-to-r from-blue-500 to-purple-600' 
                        : 'bg-gray-600'
                    }`}
                    onClick={() => setSettings({...settings, autoCapture: !settings.autoCapture})}
                  >
                    <div className={`w-6 h-6 bg-white rounded-full shadow-lg transform transition-transform duration-300 mt-1 ${
                      settings.autoCapture ? 'translate-x-9' : 'translate-x-1'
                    }`}></div>
                  </div>
                </div>
              </div>
              
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-300">Temperature Threshold (°C)</label>
                <input
                  type="number"
                  step="0.1"
                  value={settings.tempThreshold}
                  onChange={(e) => setSettings({...settings, tempThreshold: parseFloat(e.target.value)})}
                  className="w-full p-4 bg-white/10 backdrop-blur-xl rounded-xl border border-white/20 focus:border-blue-500 focus:outline-none transition-all text-white"
                />
              </div>
              
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-300">Capture Interval (seconds)</label>
                <input
                  type="number"
                  value={settings.captureInterval}
                  onChange={(e) => setSettings({...settings, captureInterval: parseInt(e.target.value)})}
                  className="w-full p-4 bg-white/10 backdrop-blur-xl rounded-xl border border-white/20 focus:border-blue-500 focus:outline-none transition-all text-white"
                />
              </div>
            </div>
            
            <div className="mt-6 p-4 bg-gray-800/50 rounded-2xl">
              <h4 className="text-lg font-medium mb-3">System Status</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>Camera Type: <span className="text-blue-400">{cameraType}</span></div>
                <div>Sensor Type: <span className={getSensorStatusColor()}>{getSensorStatusText()}</span></div>
                <div>Connection: <span className={connectionStatus === 'connected' ? 'text-green-400' : 'text-red-400'}>{connectionStatus}</span></div>
                <div>
                  <button 
                    onClick={checkSystemStatus}
                    className="px-3 py-1 bg-blue-500/20 rounded-lg text-blue-400 hover:bg-blue-500/30 transition-all"
                  >
                    Refresh Status
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Camera Feed */}
          <div className="lg:col-span-2">
            <div className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold flex items-center gap-3">
                  <Eye className="w-7 h-7 text-blue-400" />
                  Live Camera Feed
                </h2>
                <div className="flex gap-3">
                  <button
                    onClick={toggleMonitoring}
                    className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all duration-300 hover:scale-105 ${
                      isMonitoring 
                        ? 'bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600' 
                        : 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600'
                    }`}
                  >
                    {isMonitoring ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                    {isMonitoring ? 'Stop' : 'Start'}
                  </button>
                  <button
                    onClick={captureAttendance}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl font-medium bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 transition-all duration-300 hover:scale-105"
                  >
                    <Save className="w-5 h-5" />
                    Capture
                  </button>
                </div>
              </div>
              
              <div className="relative bg-black/50 rounded-2xl overflow-hidden backdrop-blur-xl border border-white/10">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full h-auto max-h-96"
                  style={{ aspectRatio: '4/3' }}
                />
                <canvas 
                  ref={canvasRef} 
                  className="w-full h-auto max-h-96" 
                  style={{ aspectRatio: '4/3' }} 
                />
                
                {/* Futuristic Overlay */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute top-4 left-4 right-4 flex justify-between">
                    <div className="bg-black/70 backdrop-blur-xl rounded-xl p-3 border border-cyan-500/50">
                      <div className="flex items-center gap-2 text-cyan-400 mb-1">
                        <Users className="w-4 h-4" />
                        <span className="text-sm font-medium">Faces Detected</span>
                      </div>
                      <div className="text-2xl font-bold text-white">{facesDetected}</div>
                    </div>
                    
                    <div className="bg-black/70 backdrop-blur-xl rounded-xl p-3 border border-purple-500/50">
                      <div className="flex items-center gap-2 text-purple-400 mb-1">
                        <Clock className="w-4 h-4" />
                        <span className="text-sm font-medium">System Time</span>
                      </div>
                      <div className="text-lg font-bold text-white">{new Date().toLocaleTimeString()}</div>
                    </div>
                  </div>
                  
                  {/* Scanning Lines Effect */}
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/10 to-transparent animate-pulse"></div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel */}
          <div className="space-y-6">
            {/* Temperature Monitor */}
            <div className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl p-6">
              <h3 className="text-xl font-bold mb-6 flex items-center gap-3">
                <Thermometer className="w-6 h-6 text-red-400" />
                Thermal Analytics
              </h3>
              
              <div className="space-y-4">
                <div className={`p-4 rounded-2xl backdrop-blur-xl border transition-all duration-500 ${
                  currentTemp && currentTemp > settings.tempThreshold 
                    ? 'bg-red-500/20 border-red-400/30 animate-pulse' 
                    : 'bg-green-500/20 border-green-400/30'
                }`}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-300">Body Temperature</span>
                    <div className="flex items-center gap-2">
                      {currentTemp && currentTemp > settings.tempThreshold ? (
                        <AlertCircle className="w-5 h-5 text-red-400 animate-pulse" />
                      ) : (
                        <CheckCircle className="w-5 h-5 text-green-400" />
                      )}
                      <span className={`font-bold text-2xl ${
                        currentTemp && currentTemp > settings.tempThreshold ? 'text-red-400' : 'text-green-400'
                      }`}>
                        {currentTemp ? `${currentTemp.toFixed(1)}°C` : '--'}
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-black/30 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full transition-all duration-500 ${
                        currentTemp && currentTemp > settings.tempThreshold 
                          ? 'bg-gradient-to-r from-red-500 to-pink-500' 
                          : 'bg-gradient-to-r from-green-500 to-emerald-500'
                      }`}
                      style={{ width: `${currentTemp ? Math.min((currentTemp / 40) * 100, 100) : 0}%` }}
                    ></div>
                  </div>
                </div>
                
                <div className="p-4 rounded-2xl bg-blue-500/20 border border-blue-400/30 backdrop-blur-xl">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-300">Ambient Temperature</span>
                    <span className="font-bold text-xl text-blue-400">
                      {ambientTemp ? `${ambientTemp.toFixed(1)}°C` : '--'}
                    </span>
                  </div>
                </div>
                
                {sensorStatus === 'mock' && (
                  <div className="p-3 rounded-xl bg-yellow-500/20 border border-yellow-400/30">
                    <div className="flex items-center gap-2 text-yellow-400 text-sm">
                      <AlertCircle className="w-4 h-4" />
                      <span>Using mock temperature data - MLX90614 not detected</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Advanced Statistics */}
            <div className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl p-6">
              <h3 className="text-xl font-bold mb-6 flex items-center gap-3">
                <TrendingUp className="w-6 h-6 text-green-400" />
                System Analytics
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gradient-to-br from-blue-500/20 to-purple-500/20 p-4 rounded-2xl border border-blue-400/30">
                  <div className="text-2xl font-bold text-blue-400">{stats.totalRecords}</div>
                  <div className="text-sm text-gray-300">Total Records</div>
                </div>
                <div className="bg-gradient-to-br from-red-500/20 to-pink-500/20 p-4 rounded-2xl border border-red-400/30">
                  <div className="text-2xl font-bold text-red-400">{stats.highTempCount}</div>
                  <div className="text-sm text-gray-300">High Temperature</div>
                </div>
                <div className="bg-gradient-to-br from-green-500/20 to-emerald-500/20 p-4 rounded-2xl border border-green-400/30">
                  <div className="text-2xl font-bold text-green-400">
                    {stats.avgBodyTemp > 0 ? `${stats.avgBodyTemp.toFixed(1)}°C` : '--'}
                  </div>
                  <div className="text-sm text-gray-300">Avg Body Temp</div>
                </div>
                <div className="bg-gradient-to-br from-cyan-500/20 to-blue-500/20 p-4 rounded-2xl border border-cyan-400/30">
                  <div className="text-2xl font-bold text-cyan-400">
                    {stats.avgAmbientTemp > 0 ? `${stats.avgAmbientTemp.toFixed(1)}°C` : '--'}
                  </div>
                  <div className="text-sm text-gray-300">Avg Ambient</div>
                </div>
              </div>
              
              <button
                onClick={exportData}
                className="w-full mt-6 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 px-4 py-3 rounded-2xl font-medium flex items-center justify-center gap-2 transition-all duration-300 hover:scale-105"
              >
                <Download className="w-5 h-5" />
                Export Analytics
              </button>
            </div>
          </div>
        </div>

        {/* Attendance Records Table */}
        <div className="mt-8 bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl p-6">
          <h3 className="text-2xl font-bold mb-6 flex items-center gap-3">
            <Shield className="w-7 h-7 text-indigo-400" />
            Attendance Records
          </h3>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  {['Timestamp', 'Person ID', 'Faces', 'Body Temp', 'Ambient', 'Status', 'Sensor'].map((header) => (
                    <th key={header} className="text-left p-4 text-gray-300 font-medium">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {attendanceRecords.slice(0, 10).map((record, index) => (
                  <tr key={record.id || index} className="border-b border-white/5 hover:bg-white/5 transition-all duration-300">
                    <td className="p-4 text-sm">{formatTime(record.timestamp)}</td>
                    <td className="p-4 text-sm font-medium text-blue-400">{record.person_id}</td>
                    <td className="p-4 text-sm">{record.faces_detected}</td>
                    <td className="p-4 text-sm">
                      {record.body_temperature ? `${record.body_temperature.toFixed(1)}°C` : '--'}
                    </td>
                    <td className="p-4 text-sm">
                      {record.ambient_temperature ? `${record.ambient_temperature.toFixed(1)}°C` : '--'}
                    </td>
                    <td className="p-4 text-sm">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium backdrop-blur-xl ${
                        record.temperature_status === 'High' 
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                          : record.temperature_status === 'Normal'
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                          : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                      }`}>
                        {record.temperature_status || 'N/A'}
                      </span>
                    </td>
                    <td className="p-4 text-sm">
                      <span className={`text-xs ${
                        record.sensor_type === 'mock' ? 'text-yellow-400' : 'text-green-400'
                      }`}>
                        {record.sensor_type || 'N/A'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {attendanceRecords.length === 0 && (
              <div className="text-center py-16">
                <div className="w-32 h-32 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-full mx-auto mb-6 flex items-center justify-center backdrop-blur-xl border border-white/10">
                  <Users className="w-16 h-16 text-gray-400" />
                </div>
                <p className="text-gray-300 text-xl font-medium">No records captured yet</p>
                <p className="text-gray-500 text-sm mt-2">Start monitoring to begin collecting data</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AttendanceMonitorDashboard;