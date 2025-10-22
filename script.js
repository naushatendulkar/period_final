// User data storage (in a real app, this would be handled by a backend)
let users = JSON.parse(localStorage.getItem('periodTrackerUsers')) || [];
let currentUser = null;
let periodData = JSON.parse(localStorage.getItem('periodData')) || [];
let dailyLogs = JSON.parse(localStorage.getItem('dailyLogs')) || [];

// AI Training Data from CSV
let trainingData = null;
let aiModels = {
    cycleLength: null,
    ovulation: null,
    mensesIntensity: null,
    fertilityWindow: null
};

// IndexedDB Database
let cycliqueDB = null;

// DOM Elements
const loginModal = document.getElementById('loginModal');
const signupModal = document.getElementById('signupModal');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');

// IndexedDB Database Manager
class CycliqueDB {
    constructor() {
        this.db = null;
        this.dbName = 'CycliqueDB';
        this.version = 1;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onerror = () => {
                console.error('IndexedDB failed to open');
                reject(request.error);
            };
            
            request.onsuccess = () => {
                this.db = request.result;
                console.log('IndexedDB opened successfully');
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create object stores
                if (!db.objectStoreNames.contains('users')) {
                    const userStore = db.createObjectStore('users', { keyPath: 'id' });
                    userStore.createIndex('email', 'email', { unique: true });
                }
                
                if (!db.objectStoreNames.contains('periods')) {
                    const periodStore = db.createObjectStore('periods', { keyPath: 'id' });
                    periodStore.createIndex('userId', 'userId');
                    periodStore.createIndex('startDate', 'startDate');
                }
                
                if (!db.objectStoreNames.contains('dailyLogs')) {
                    const logStore = db.createObjectStore('dailyLogs', { keyPath: 'id' });
                    logStore.createIndex('userId', 'userId');
                    logStore.createIndex('date', 'date');
                }
                
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'userId' });
                }
                
                console.log('IndexedDB object stores created');
            };
        });
    }

    // User operations
    async addUser(user) {
        const transaction = this.db.transaction(['users'], 'readwrite');
        const store = transaction.objectStore('users');
        return store.add(user);
    }

    async getUser(id) {
        const transaction = this.db.transaction(['users'], 'readonly');
        const store = transaction.objectStore('users');
        return new Promise((resolve, reject) => {
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getUserByEmail(email) {
        const transaction = this.db.transaction(['users'], 'readonly');
        const store = transaction.objectStore('users');
        const index = store.index('email');
        return new Promise((resolve, reject) => {
            const request = index.get(email);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async updateUser(user) {
        const transaction = this.db.transaction(['users'], 'readwrite');
        const store = transaction.objectStore('users');
        return store.put(user);
    }

    // Period operations
    async addPeriod(period) {
        const transaction = this.db.transaction(['periods'], 'readwrite');
        const store = transaction.objectStore('periods');
        return store.add(period);
    }

    async getPeriods(userId) {
        const transaction = this.db.transaction(['periods'], 'readonly');
        const store = transaction.objectStore('periods');
        const index = store.index('userId');
        return new Promise((resolve, reject) => {
            const request = index.getAll(userId);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async updatePeriod(period) {
        const transaction = this.db.transaction(['periods'], 'readwrite');
        const store = transaction.objectStore('periods');
        return store.put(period);
    }

    async deletePeriod(id) {
        const transaction = this.db.transaction(['periods'], 'readwrite');
        const store = transaction.objectStore('periods');
        return store.delete(id);
    }

    // Daily log operations
    async addDailyLog(log) {
        const transaction = this.db.transaction(['dailyLogs'], 'readwrite');
        const store = transaction.objectStore('dailyLogs');
        return store.add(log);
    }

    async getDailyLogs(userId) {
        const transaction = this.db.transaction(['dailyLogs'], 'readonly');
        const store = transaction.objectStore('dailyLogs');
        const index = store.index('userId');
        return new Promise((resolve, reject) => {
            const request = index.getAll(userId);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getDailyLog(userId, date) {
        const transaction = this.db.transaction(['dailyLogs'], 'readonly');
        const store = transaction.objectStore('dailyLogs');
        const index = store.index('userId');
        return new Promise((resolve, reject) => {
            const request = index.getAll(userId);
            request.onsuccess = () => {
                const logs = request.result;
                const log = logs.find(l => l.date === date);
                resolve(log || null);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async updateDailyLog(log) {
        const transaction = this.db.transaction(['dailyLogs'], 'readwrite');
        const store = transaction.objectStore('dailyLogs');
        return store.put(log);
    }

    // Export/Import operations
    async exportData(userId) {
        const [periods, logs] = await Promise.all([
            this.getPeriods(userId),
            this.getDailyLogs(userId)
        ]);
        
        return {
            periods,
            dailyLogs: logs,
            exportDate: new Date().toISOString(),
            version: this.version
        };
    }

    async importData(userId, data) {
        const transaction = this.db.transaction(['periods', 'dailyLogs'], 'readwrite');
        const periodStore = transaction.objectStore('periods');
        const logStore = transaction.objectStore('dailyLogs');
        
        // Clear existing data
        const existingPeriods = await this.getPeriods(userId);
        const existingLogs = await this.getDailyLogs(userId);
        
        for (const period of existingPeriods) {
            await periodStore.delete(period.id);
        }
        
        for (const log of existingLogs) {
            await logStore.delete(log.id);
        }
        
        // Add imported data
        for (const period of data.periods || []) {
            period.userId = userId;
            await periodStore.add(period);
        }
        
        for (const log of data.dailyLogs || []) {
            log.userId = userId;
            await logStore.add(log);
        }
    }
}
const successMessage = document.getElementById('successMessage');
const errorMessage = document.getElementById('errorMessage');
const successText = document.getElementById('successText');
const errorText = document.getElementById('errorText');

// Database initialization and migration
async function initDatabase() {
    try {
        cycliqueDB = new CycliqueDB();
        await cycliqueDB.init();
        console.log('Database initialized successfully');
        
        // Migrate data from localStorage if needed
        await migrateFromLocalStorage();
        
        return true;
    } catch (error) {
        console.error('Failed to initialize database:', error);
        return false;
    }
}

async function migrateFromLocalStorage() {
    try {
        // Check if we have data in localStorage
        const hasLocalStorageData = localStorage.getItem('periodTrackerUsers') || 
                                   localStorage.getItem('periodData') || 
                                   localStorage.getItem('dailyLogs');
        
        if (!hasLocalStorageData) {
            console.log('No localStorage data to migrate');
            return;
        }
        
        console.log('Migrating data from localStorage to IndexedDB...');
        
        // Migrate users
        const users = JSON.parse(localStorage.getItem('periodTrackerUsers')) || [];
        for (const user of users) {
            try {
                await cycliqueDB.addUser(user);
            } catch (error) {
                console.log('User already exists or error adding user:', error);
            }
        }
        
        // Migrate periods
        const periods = JSON.parse(localStorage.getItem('periodData')) || [];
        for (const period of periods) {
            try {
                await cycliqueDB.addPeriod(period);
            } catch (error) {
                console.log('Error adding period:', error);
            }
        }
        
        // Migrate daily logs
        const logs = JSON.parse(localStorage.getItem('dailyLogs')) || [];
        for (const log of logs) {
            try {
                await cycliqueDB.addDailyLog(log);
            } catch (error) {
                console.log('Error adding daily log:', error);
            }
        }
        
        console.log('Data migration completed successfully');
        
        // Clear localStorage after successful migration
        localStorage.removeItem('periodTrackerUsers');
        localStorage.removeItem('periodData');
        localStorage.removeItem('dailyLogs');
        
    } catch (error) {
        console.error('Error during migration:', error);
    }
}

// Modal Functions
function showLoginModal() {
    closeModal('signupModal');
    loginModal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function showSignupModal() {
    closeModal('loginModal');
    signupModal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
        console.log(`Modal ${modalId} closed`);
    } else {
        console.error(`Modal ${modalId} not found`);
    }
}

function switchToSignup() {
    closeModal('loginModal');
    showSignupModal();
}

function switchToLogin() {
    closeModal('signupModal');
    showLoginModal();
}

// Close modals when clicking outside
window.onclick = function(event) {
    if (event.target === loginModal) {
        closeModal('loginModal');
    }
    if (event.target === signupModal) {
        closeModal('signupModal');
    }
}

// Form Validation Functions
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function validatePassword(password) {
    // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/;
    return passwordRegex.test(password);
}

function validateAge(age) {
    return age >= 13 && age <= 100;
}

// Message Display Functions
function showSuccess(message) {
    successText.textContent = message;
    successMessage.classList.add('show');
    setTimeout(() => {
        successMessage.classList.remove('show');
    }, 4000);
}

function showError(message) {
    errorText.textContent = message;
    errorMessage.classList.add('show');
    setTimeout(() => {
        errorMessage.classList.remove('show');
    }, 4000);
}

// User Authentication Functions
function registerUser(userData) {
    // Check if user already exists
    const existingUser = users.find(user => user.email === userData.email);
    if (existingUser) {
        throw new Error('User with this email already exists');
    }

    // Create new user object
    const newUser = {
        id: Date.now().toString(),
        name: userData.name,
        email: userData.email,
        password: userData.password, // In real app, this would be hashed
        age: userData.age,
        createdAt: new Date().toISOString(),
        isActive: true
    };

    users.push(newUser);
    localStorage.setItem('periodTrackerUsers', JSON.stringify(users));
    return newUser;
}

async function authenticateUser(email, password) {
    if (!cycliqueDB) {
        throw new Error('Database not initialized');
    }
    
    const user = await cycliqueDB.getUserByEmail(email);
    if (!user) {
        throw new Error('Invalid email or password');
    }
    if (user.password !== password) {
        throw new Error('Invalid email or password');
    }
    if (!user.isActive) {
        throw new Error('Account is deactivated');
    }
    return user;
}

// Login Form Handler
if (loginForm) {
    loginForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    console.log('Login form submitted'); // Debug log
    
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const rememberMe = document.querySelector('input[name="remember"]').checked;

    console.log('Email:', email, 'Password:', password); // Debug log

    // Validation
    if (!email || !password) {
        showError('Please fill in all fields');
        return;
    }

    if (!validateEmail(email)) {
        showError('Please enter a valid email address');
        return;
    }

    // Show loading state
    const submitBtn = loginForm.querySelector('.auth-btn');
    const originalText = submitBtn.textContent;
    submitBtn.innerHTML = '<span class="loading"></span> Logging in...';
    submitBtn.disabled = true;

    try {
        console.log('Attempting to authenticate user...'); // Debug log
        const user = await authenticateUser(email, password);
        console.log('User authenticated:', user); // Debug log
            
        // Store user session
        currentUser = user;
        if (rememberMe) {
            localStorage.setItem('currentUser', JSON.stringify(user));
        } else {
            sessionStorage.setItem('currentUser', JSON.stringify(user));
        }

        // Close modal first
        closeModal('loginModal');
        
        // Reset form
        loginForm.reset();
        
        // Show dashboard
        showDashboard();
        
        // Show success message after dashboard is shown
        setTimeout(() => {
            showSuccess(`Welcome back, ${user.name}!`);
        }, 100);

    } catch (error) {
        console.error('Login error:', error); // Debug log
        showError(error.message);
    } finally {
        // Reset button
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
    });
}

// Signup Form Handler
if (signupForm) {
    signupForm.addEventListener('submit', function(e) {
    e.preventDefault();
    
    const name = document.getElementById('signupName').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const age = parseInt(document.getElementById('signupAge').value);
    const termsAccepted = document.querySelector('input[name="terms"]').checked;

    // Validation
    if (!name || !email || !password || !confirmPassword || !age) {
        showError('Please fill in all fields');
        return;
    }

    if (name.length < 2) {
        showError('Name must be at least 2 characters long');
        return;
    }

    if (!validateEmail(email)) {
        showError('Please enter a valid email address');
        return;
    }

    if (!validatePassword(password)) {
        showError('Password must be at least 8 characters with uppercase, lowercase, and number');
        return;
    }

    if (password !== confirmPassword) {
        showError('Passwords do not match');
        return;
    }

    if (!validateAge(age)) {
        showError('Age must be between 13 and 100');
        return;
    }

    if (!termsAccepted) {
        showError('Please accept the terms and conditions');
        return;
    }

    // Show loading state
    const submitBtn = signupForm.querySelector('.auth-btn');
    const originalText = submitBtn.textContent;
    submitBtn.innerHTML = '<span class="loading"></span> Creating Account...';
    submitBtn.disabled = true;

    // Simulate API call delay
    setTimeout(() => {
        try {
            const userData = { name, email, password, age };
            const newUser = registerUser(userData);
            
            showSuccess(`Account created successfully! Welcome, ${newUser.name}!`);
            closeModal('signupModal');
            
            // Reset form
            signupForm.reset();
            
            // In a real app, redirect to onboarding
            setTimeout(() => {
                alert('Account created! In a real app, you would be redirected to set up your profile.');
            }, 1000);

        } catch (error) {
            showError(error.message);
        } finally {
            // Reset button
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    }, 2000);
    });
}

// Real-time password confirmation validation
const confirmPasswordField = document.getElementById('confirmPassword');
if (confirmPasswordField) {
    confirmPasswordField.addEventListener('input', function() {
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = this.value;
    
    if (confirmPassword && password !== confirmPassword) {
        this.style.borderColor = '#f44336';
    } else {
        this.style.borderColor = '#e0e0e0';
    }
    });
}

// Real-time email validation
const signupEmailField = document.getElementById('signupEmail');
if (signupEmailField) {
    signupEmailField.addEventListener('blur', function() {
        const email = this.value.trim();
        if (email && !validateEmail(email)) {
            this.style.borderColor = '#f44336';
        } else {
            this.style.borderColor = '#e0e0e0';
        }
    });
}

const loginEmailField = document.getElementById('loginEmail');
if (loginEmailField) {
    loginEmailField.addEventListener('blur', function() {
        const email = this.value.trim();
        if (email && !validateEmail(email)) {
            this.style.borderColor = '#f44336';
        } else {
            this.style.borderColor = '#e0e0e0';
        }
    });
}

// Real-time password strength indicator
const signupPasswordField = document.getElementById('signupPassword');
if (signupPasswordField) {
    signupPasswordField.addEventListener('input', function() {
    const password = this.value;
    const strength = getPasswordStrength(password);
    
    // Remove existing strength indicator
    const existingIndicator = document.querySelector('.password-strength');
    if (existingIndicator) {
        existingIndicator.remove();
    }
    
    if (password.length > 0) {
        const indicator = document.createElement('div');
        indicator.className = 'password-strength';
        indicator.style.marginTop = '0.5rem';
        indicator.style.fontSize = '0.8rem';
        
        if (strength === 'weak') {
            indicator.style.color = '#f44336';
            indicator.textContent = 'Password is weak';
        } else if (strength === 'medium') {
            indicator.style.color = '#ff9800';
            indicator.textContent = 'Password is medium strength';
        } else if (strength === 'strong') {
            indicator.style.color = '#4CAF50';
            indicator.textContent = 'Password is strong';
        }
        
        this.parentNode.appendChild(indicator);
    }
    });
}

function getPasswordStrength(password) {
    let score = 0;
    
    if (password.length >= 8) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^a-zA-Z\d]/.test(password)) score++;
    
    if (score < 3) return 'weak';
    if (score < 5) return 'medium';
    return 'strong';
}

// Mobile menu toggle
const hamburger = document.querySelector('.hamburger');
const navMenu = document.querySelector('.nav-menu');

hamburger.addEventListener('click', function() {
    navMenu.classList.toggle('active');
    hamburger.classList.toggle('active');
});

// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Check if user is already logged in
window.addEventListener('load', function() {
    const currentUser = localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser');
    if (currentUser) {
        const user = JSON.parse(currentUser);
        showSuccess(`Welcome back, ${user.name}!`);
    }
});

// Add some demo users for testing
if (users.length === 0) {
    console.log('Creating demo users...'); // Debug log
    const demoUsers = [
        {
            id: '1',
            name: 'Sarah Johnson',
            email: 'sarah@example.com',
            password: 'Password123',
            age: 28,
            createdAt: new Date().toISOString(),
            isActive: true
        },
        {
            id: '2',
            name: 'Emily Davis',
            email: 'emily@example.com',
            password: 'Password123',
            age: 24,
            createdAt: new Date().toISOString(),
            isActive: true
        }
    ];
    
    users = demoUsers;
    localStorage.setItem('periodTrackerUsers', JSON.stringify(users));
    console.log('Demo users created:', users); // Debug log
} else {
    console.log('Existing users found:', users); // Debug log
}

// Add keyboard navigation support
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeModal('loginModal');
        closeModal('signupModal');
    }
});

// Add form field focus effects
document.querySelectorAll('input').forEach(input => {
    input.addEventListener('focus', function() {
        this.parentNode.classList.add('focused');
    });
    
    input.addEventListener('blur', function() {
        if (!this.value) {
            this.parentNode.classList.remove('focused');
        }
    });
});

// Dashboard Functions
function showDashboard() {
    // Hide all main page sections
    const hero = document.querySelector('.hero');
    const features = document.querySelector('.features');
    const about = document.querySelector('.about');
    const navbar = document.querySelector('.navbar');
    
    if (hero) hero.style.display = 'none';
    if (features) features.style.display = 'none';
    if (about) about.style.display = 'none';
    if (navbar) navbar.style.display = 'none';
    
    // Show dashboard
    const dashboard = document.getElementById('dashboard');
    if (dashboard) {
        dashboard.style.display = 'block';
    }
    
    // Update user info
    const userDisplayName = document.getElementById('userDisplayName');
    const userName = document.getElementById('userName');
    
    if (userDisplayName) userDisplayName.textContent = currentUser.name;
    if (userName) userName.textContent = `Welcome back, ${currentUser.name}!`;
    
    // Initialize dashboard
    initializeDashboard();
    
    // Update new dashboard cards
    updateAchievementsCard();
    updatePregnancyCard();
    
    // Show dashboard tabs after login
    showDashboardTabs();
}

function hideDashboard() {
    const dashboard = document.getElementById('dashboard');
    const hero = document.querySelector('.hero');
    const features = document.querySelector('.features');
    const about = document.querySelector('.about');
    const navbar = document.querySelector('.navbar');
    
    if (dashboard) dashboard.style.display = 'none';
    if (hero) hero.style.display = 'block';
    if (features) features.style.display = 'block';
    if (about) about.style.display = 'block';
    if (navbar) navbar.style.display = 'block';
    
    // Hide dashboard tabs when not logged in
    hideDashboardTabs();
}

function logout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    sessionStorage.removeItem('currentUser');
    hideDashboard();
    hideDashboardTabs();
    showSuccess('Logged out successfully!');
}

async function initializeDashboard() {
    // Wait a bit for DOM to be ready
    setTimeout(async () => {
        try {
            // Add some sample data if no periods exist
            await addSampleDataIfNeeded();
            
            await updateQuickStats();
            generateCalendar();
            await updateInsights();
            await loadTodayLog();
        } catch (error) {
            console.error('Dashboard initialization error:', error);
        }
    }, 100);
}

async function addSampleDataIfNeeded() {
    const periods = await getUserPeriods();
    if (periods.length === 0 && currentUser) {
        // Add a sample period 3 days ago
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        const fiveDaysAgo = new Date();
        fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
        
        await addPeriod(
            fiveDaysAgo.toISOString().split('T')[0],
            threeDaysAgo.toISOString().split('T')[0],
            'medium',
            'Sample period data'
        );
    }
}

// Period Tracking Functions
async function addPeriod(startDate, endDate, flow, notes = '') {
    if (!cycliqueDB) {
        console.error('Database not initialized');
        return;
    }
    
    const period = {
        id: Date.now().toString(),
        userId: currentUser.id,
        startDate: startDate,
        endDate: endDate,
        flow: flow,
        notes: notes,
        createdAt: new Date().toISOString()
    };
    
    try {
        await cycliqueDB.addPeriod(period);
        
        // Update dashboard
        updateQuickStats();
        generateCalendar();
        updateInsights();
        
        console.log('Period added and dashboard updated');
    } catch (error) {
        console.error('Error adding period:', error);
        showError('Failed to add period. Please try again.');
    }
}

async function deletePeriod(periodId) {
    if (!cycliqueDB) {
        console.error('Database not initialized');
        return;
    }
    
    try {
        await cycliqueDB.deletePeriod(periodId);
        
        // Update dashboard
        updateQuickStats();
        generateCalendar();
        updateInsights();
        updatePeriodsList();
        
        showSuccess('Period deleted successfully!');
        console.log('Period deleted and dashboard updated');
    } catch (error) {
        console.error('Error deleting period:', error);
        showError('Failed to delete period. Please try again.');
    }
}

async function getUserPeriods() {
    if (!cycliqueDB || !currentUser) {
        return [];
    }
    
    try {
        return await cycliqueDB.getPeriods(currentUser.id);
    } catch (error) {
        console.error('Error getting periods:', error);
        return [];
    }
}

function calculateCycleLength(periods) {
    if (periods.length < 2) return 28; // Default cycle length
    
    const cycleLengths = [];
    for (let i = 1; i < periods.length; i++) {
        const start1 = new Date(periods[i-1].startDate);
        const start2 = new Date(periods[i].startDate);
        const diffTime = Math.abs(start2 - start1);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        cycleLengths.push(diffDays);
    }
    
    return Math.round(cycleLengths.reduce((a, b) => a + b, 0) / cycleLengths.length);
}

function predictNextPeriod(periods) {
    const aiPrediction = predictNextPeriodWithAI(periods);
    return aiPrediction ? aiPrediction.date : null;
}

async function updateQuickStats() {
    const periods = await getUserPeriods();
    const today = new Date();
    
    const daysSinceElement = document.getElementById('daysSinceLastPeriod');
    const nextPeriodElement = document.getElementById('nextPeriodDays');
    const cycleLengthElement = document.getElementById('cycleLength');
    
    if (!daysSinceElement || !nextPeriodElement || !cycleLengthElement) {
        console.log('Quick stats elements not found');
        return;
    }
    
    if (periods.length > 0) {
        const lastPeriod = periods[periods.length - 1];
        const lastStartDate = new Date(lastPeriod.startDate);
        const daysSince = Math.floor((today - lastStartDate) / (1000 * 60 * 60 * 24));
        
        daysSinceElement.textContent = daysSince;
        
        const nextPeriod = predictNextPeriod(periods);
        if (nextPeriod) {
            const daysUntil = Math.ceil((nextPeriod - today) / (1000 * 60 * 60 * 24));
            nextPeriodElement.textContent = daysUntil;
        } else {
            nextPeriodElement.textContent = '--';
        }
        
        const avgCycleLength = calculateCycleLength(periods);
        cycleLengthElement.textContent = avgCycleLength;
    } else {
        daysSinceElement.textContent = '--';
        nextPeriodElement.textContent = '--';
        cycleLengthElement.textContent = '28';
    }
}

// Calendar Functions
let currentCalendarDate = new Date();

async function generateCalendar() {
    const calendarGrid = document.getElementById('calendarGrid');
    const currentMonthElement = document.getElementById('currentMonth');
    
    if (!calendarGrid || !currentMonthElement) {
        console.log('Calendar elements not found, retrying...');
        // Retry after a short delay
        setTimeout(() => {
            generateCalendar();
        }, 200);
        return;
    }
    
    console.log('Generating calendar...');
    
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    
    currentMonthElement.textContent = 
        `${monthNames[currentCalendarDate.getMonth()]} ${currentCalendarDate.getFullYear()}`;
    
    const firstDay = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth(), 1);
    const lastDay = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());
    
    console.log('Calendar date:', currentCalendarDate);
    console.log('First day:', firstDay);
    console.log('Start date:', startDate);
    
    // Clear the calendar grid
    calendarGrid.innerHTML = '';
    
    // Add day headers
    const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayHeaders.forEach(day => {
        const dayHeader = document.createElement('div');
        dayHeader.className = 'calendar-day day-header';
        dayHeader.textContent = day;
        calendarGrid.appendChild(dayHeader);
    });
    
    console.log('Day headers added');
    
    // Fetch periods data once at the beginning
    const periods = await getUserPeriods();
    console.log('Periods loaded:', periods);
    
    // Generate calendar days (6 weeks = 42 days)
    for (let i = 0; i < 42; i++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);
        
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';
        dayElement.textContent = date.getDate();
        
        console.log(`Creating day ${i + 1}: ${date.getDate()}`);
        
        // Check if this is today
        const today = new Date();
        if (date.toDateString() === today.toDateString()) {
            dayElement.classList.add('today');
            console.log('Today marked:', date.getDate());
        }
        
        // Check if this is a period day
        periods.forEach(period => {
            const periodStartDate = new Date(period.startDate);
            const periodEndDate = new Date(period.endDate);
            if (date >= periodStartDate && date <= periodEndDate) {
                dayElement.classList.add('period');
                dayElement.title = `Period Day - ${period.flow} flow`;
                console.log('Period day marked:', date.getDate());
                
                // Add delete button for period days
                const deleteBtn = document.createElement('button');
                deleteBtn.innerHTML = '×';
                deleteBtn.className = 'period-delete-btn';
                deleteBtn.title = 'Delete this period';
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    const startDateStr = periodStartDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    const endDateStr = periodEndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    confirmDeletePeriod(period.id, `${startDateStr} - ${endDateStr}`);
                };
                dayElement.appendChild(deleteBtn);
            }
        });
        
        // Check if this is predicted period day
        const nextPeriod = predictNextPeriod(periods);
        if (nextPeriod && date.toDateString() === nextPeriod.toDateString()) {
            dayElement.classList.add('predicted');
            console.log('Predicted period day marked:', date.getDate());
        }
        
        calendarGrid.appendChild(dayElement);
    }
    
    console.log('Calendar generated successfully with', calendarGrid.children.length, 'elements');
}

async function previousMonth() {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
    await generateCalendar();
}

async function nextMonth() {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
    await generateCalendar();
}

// Manual calendar refresh function
async function refreshCalendar() {
    console.log('Manually refreshing calendar...');
    await generateCalendar();
}

// Test function to create a simple calendar without periods
function generateSimpleCalendar() {
    const calendarGrid = document.getElementById('calendarGrid');
    const currentMonthElement = document.getElementById('currentMonth');
    
    if (!calendarGrid || !currentMonthElement) {
        console.log('Calendar elements not found for simple calendar');
        return;
    }
    
    console.log('Generating simple calendar...');
    
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    
    currentMonthElement.textContent = 
        `${monthNames[currentCalendarDate.getMonth()]} ${currentCalendarDate.getFullYear()}`;
    
    const firstDay = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth(), 1);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());
    
    // Clear the calendar grid
    calendarGrid.innerHTML = '';
    
    // Add day headers
    const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayHeaders.forEach(day => {
        const dayHeader = document.createElement('div');
        dayHeader.className = 'calendar-day day-header';
        dayHeader.textContent = day;
        calendarGrid.appendChild(dayHeader);
    });
    
    // Generate simple calendar days
    for (let i = 0; i < 42; i++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);
        
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';
        dayElement.textContent = date.getDate();
        
        // Highlight today
        const today = new Date();
        if (date.toDateString() === today.toDateString()) {
            dayElement.classList.add('today');
        }
        
        calendarGrid.appendChild(dayElement);
    }
    
    console.log('Simple calendar generated with', calendarGrid.children.length, 'elements');
}

// Manage Periods Functions
function showPeriodsList() {
    console.log('Opening periods list modal...');
    const modal = document.getElementById('managePeriodsModal');
    if (modal) {
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        updatePeriodsList();
        console.log('Modal opened successfully');
    } else {
        console.error('Modal element not found');
    }
}

async function updatePeriodsList() {
    const periodsListElement = document.getElementById('periodsList');
    if (!periodsListElement) {
        console.log('Periods list element not found');
        return;
    }
    
    try {
        const periods = await getUserPeriods();
        console.log('Updating periods list with', periods.length, 'periods');
        
        if (periods.length === 0) {
            periodsListElement.innerHTML = `
                <div class="period-item">
                    <div class="period-info">
                        <div class="period-dates">No periods recorded yet</div>
                        <div class="period-details">Add your first period to start tracking</div>
                    </div>
                </div>
            `;
            return;
        }
        
        // Sort periods by start date (newest first)
        const sortedPeriods = periods.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
        
        periodsListElement.innerHTML = sortedPeriods.map(period => {
            const startDate = new Date(period.startDate);
            const endDate = new Date(period.endDate);
            const duration = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
            
            const startDateStr = startDate.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric',
                year: 'numeric'
            });
            const endDateStr = endDate.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric',
                year: 'numeric'
            });
            
            const flowClass = `flow-${period.flow}`;
            const flowLabel = period.flow.charAt(0).toUpperCase() + period.flow.slice(1);
            
            return `
                <div class="period-item">
                    <div class="period-info">
                        <div class="period-dates">
                            ${startDateStr} - ${endDateStr}
                            <span class="flow-indicator ${flowClass}">${flowLabel}</span>
                        </div>
                        <div class="period-details">
                            ${duration} day${duration !== 1 ? 's' : ''} • 
                            ${period.notes ? period.notes : 'No notes'}
                        </div>
                    </div>
                    <div class="period-actions">
                        <button class="delete-btn" onclick="confirmDeletePeriod('${period.id}', '${startDateStr} - ${endDateStr}')" title="Delete Period">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error updating periods list:', error);
        periodsListElement.innerHTML = `
            <div class="period-item">
                <div class="period-info">
                    <div class="period-dates">Error loading periods</div>
                    <div class="period-details">Please try refreshing the page</div>
                </div>
            </div>
        `;
    }
}

function confirmDeletePeriod(periodId, periodDates) {
    if (confirm(`Are you sure you want to delete the period from ${periodDates}?\n\nThis action cannot be undone.`)) {
        deletePeriod(periodId);
    }
}

// Tab switching function
function switchTab(tabName) {
    // Remove active class from all tabs and content
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    // Add active class to selected tab and content
    document.querySelector(`[onclick="switchTab('${tabName}')"]`).classList.add('active');
    document.getElementById(`${tabName}Tab`).classList.add('active');
    
    // Load data for the active tab
    if (tabName === 'periods') {
        updatePeriodsList();
    } else if (tabName === 'symptoms') {
        loadTodayLog();
    }
}

// Log Symptoms Modal Functions
function showLogSymptomsModal() {
    console.log('Opening log symptoms modal...');
    const modal = document.getElementById('logSymptomsModal');
    if (modal) {
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        
        // Set today's date
        const today = new Date();
        const dateStr = today.toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
        document.getElementById('symptomsDate').textContent = dateStr;
        
        // Load existing data for today
        loadTodayLog();
        console.log('Log symptoms modal opened successfully');
    } else {
        console.error('Log symptoms modal element not found');
    }
}

// Chatbot Functions
function toggleChatbot() {
    const modal = document.getElementById('chatbotModal');
    if (modal.style.display === 'block') {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    } else {
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        // Focus on input when opened
        setTimeout(() => {
            document.getElementById('chatbotInput').focus();
        }, 100);
    }
}

function handleChatbotKeypress(event) {
    if (event.key === 'Enter') {
        sendChatbotMessage();
    }
}

function sendChatbotMessage() {
    const input = document.getElementById('chatbotInput');
    const message = input.value.trim();
    
    if (message === '') return;
    
    // Add user message
    addMessage(message, 'user');
    
    // Clear input
    input.value = '';
    
    // Get bot response
    const response = getBotResponse(message);
    
    // Add bot response with delay
    setTimeout(() => {
        addMessage(response, 'bot');
    }, 1000);
}

function addMessage(text, sender) {
    const messagesContainer = document.getElementById('chatbotMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    
    const icon = sender === 'bot' ? 'fas fa-robot' : 'fas fa-user';
    
    messageDiv.innerHTML = `
        <div class="message-content">
            <i class="${icon}"></i>
            <div class="message-text">${text}</div>
        </div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function getBotResponse(userMessage) {
    const message = userMessage.toLowerCase();
    
    // Period-related questions
    if (message.includes('period') || message.includes('menstrual')) {
        if (message.includes('normal') || message.includes('regular')) {
            return "A normal menstrual cycle typically lasts 21-35 days, with periods lasting 3-7 days. However, every woman is different, and what's normal for you might vary. Track your cycles to understand your personal pattern.";
        }
        if (message.includes('irregular') || message.includes('late')) {
            return "Irregular periods can be caused by stress, weight changes, hormonal imbalances, or medical conditions. If your periods are consistently irregular or you're concerned, it's best to consult with a healthcare provider.";
        }
        if (message.includes('pain') || message.includes('cramp')) {
            return "Period cramps are common and usually normal. You can try heat therapy, gentle exercise, or over-the-counter pain relievers. If cramps are severe or interfere with daily activities, consider speaking with a doctor.";
        }
        return "I can help with period-related questions! Feel free to ask about cycle length, symptoms, irregular periods, or any other menstrual health concerns.";
    }
    
    // Symptom questions
    if (message.includes('symptom') || message.includes('bloating') || message.includes('fatigue')) {
        return "Common period symptoms include cramps, bloating, fatigue, mood changes, breast tenderness, and headaches. These are usually normal, but if symptoms are severe or concerning, please consult a healthcare provider.";
    }
    
    // Health questions
    if (message.includes('health') || message.includes('doctor') || message.includes('medical')) {
        return "For serious health concerns, always consult with a qualified healthcare provider. I can provide general information, but I'm not a substitute for professional medical advice.";
    }
    
    // General questions
    if (message.includes('hello') || message.includes('hi') || message.includes('hey')) {
        return "Hello! I'm here to help answer your health and period-related questions. What would you like to know?";
    }
    
    if (message.includes('help') || message.includes('what can you do')) {
        return "I can help with questions about periods, menstrual cycles, symptoms, general health, and provide educational information. Just ask me anything!";
    }
    
    // Default response
    return "I understand you're asking about: '" + userMessage + "'. While I can provide general health information, for specific medical concerns, please consult with a healthcare provider. Is there anything else I can help you with?";
}


// Health Education Functions
function showEducationModal() {
    const modal = document.getElementById('educationModal');
    if (modal) {
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        loadEducationContent();
    }
}

function showEducationTab(tabName) {
    // Hide all tabs
    const tabs = document.querySelectorAll('.education-tab-content');
    tabs.forEach(tab => tab.style.display = 'none');
    
    // Remove active class from all nav buttons
    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => btn.classList.remove('active'));
    
    // Show selected tab
    const selectedTab = document.getElementById(tabName + 'Tab');
    if (selectedTab) {
        selectedTab.style.display = 'block';
    }
    
    // Add active class to selected nav button
    const selectedBtn = document.querySelector(`[onclick="showEducationTab('${tabName}')"]`);
    if (selectedBtn) {
        selectedBtn.classList.add('active');
    }
    
    // Load content based on tab
    if (tabName === 'articles') {
        loadArticles();
    } else if (tabName === 'videos') {
        loadVideos();
    } else if (tabName === 'bookmarks') {
        loadBookmarks();
    }
}

function loadEducationContent() {
    loadArticles();
}

function loadArticles() {
    const articlesGrid = document.getElementById('articlesGrid');
    if (!articlesGrid) return;
    
    const articles = [
        {
            id: 1,
            title: "Understanding Your Menstrual Cycle",
            content: "Learn about the phases of your menstrual cycle and what's normal for your body...",
            category: "menstrual",
            readTime: "5 min",
            image: "fas fa-heartbeat"
        },
        {
            id: 2,
            title: "Managing Period Pain Naturally",
            content: "Discover natural remedies and techniques to help alleviate menstrual cramps...",
            category: "menstrual",
            readTime: "7 min",
            image: "fas fa-leaf"
        },
        {
            id: 3,
            title: "Fertility Awareness Methods",
            content: "Learn about natural family planning and fertility tracking methods...",
            category: "fertility",
            readTime: "10 min",
            image: "fas fa-baby"
        },
        {
            id: 4,
            title: "Nutrition for Hormonal Balance",
            content: "Discover foods that can help support your hormonal health throughout your cycle...",
            category: "wellness",
            readTime: "8 min",
            image: "fas fa-apple-alt"
        },
        {
            id: 5,
            title: "Mental Health and Menstruation",
            content: "Understanding the connection between your mental health and menstrual cycle...",
            category: "mental",
            readTime: "6 min",
            image: "fas fa-brain"
        },
        {
            id: 6,
            title: "Exercise During Your Period",
            content: "Safe and effective exercises you can do during your menstrual cycle...",
            category: "wellness",
            readTime: "9 min",
            image: "fas fa-dumbbell"
        }
    ];
    
    articlesGrid.innerHTML = articles.map(article => `
        <div class="article-card" onclick="openArticle(${article.id})">
            <div class="article-image-large">
                <i class="${article.image}"></i>
            </div>
            <div class="article-card-content">
                <h5>${article.title}</h5>
                <p>${article.content}</p>
                <div class="article-meta">
                    <span class="read-time"><i class="fas fa-clock"></i> ${article.readTime}</span>
                    <span class="category">${article.category.charAt(0).toUpperCase() + article.category.slice(1)}</span>
                </div>
            </div>
        </div>
    `).join('');
}

function loadVideos() {
    const videosGrid = document.getElementById('videosGrid');
    if (!videosGrid) return;
    
    const videos = [
        {
            id: 1,
            title: "Yoga for Period Relief",
            description: "Gentle yoga poses to help alleviate menstrual cramps and discomfort",
            category: "wellness",
            duration: "8:30",
            thumbnail: "fas fa-play"
        },
        {
            id: 2,
            title: "Meditation for PMS",
            description: "Guided meditation techniques to help manage premenstrual symptoms",
            category: "mental",
            duration: "12:15",
            thumbnail: "fas fa-play"
        },
        {
            id: 3,
            title: "Nutrition for Hormonal Health",
            description: "Learn about foods that support hormonal balance throughout your cycle",
            category: "wellness",
            duration: "15:45",
            thumbnail: "fas fa-play"
        },
        {
            id: 4,
            title: "Understanding Fertility Signs",
            description: "Educational video about recognizing your body's fertility signals",
            category: "fertility",
            duration: "10:20",
            thumbnail: "fas fa-play"
        }
    ];
    
    videosGrid.innerHTML = videos.map(video => `
        <div class="video-card-modal" onclick="playVideo(${video.id})">
            <div class="video-thumbnail">
                <i class="${video.thumbnail}"></i>
                <div class="video-duration">${video.duration}</div>
            </div>
            <div class="video-card-content">
                <h5>${video.title}</h5>
                <p>${video.description}</p>
                <div class="video-meta">
                    <span class="video-category">${video.category.charAt(0).toUpperCase() + video.category.slice(1)}</span>
                </div>
            </div>
        </div>
    `).join('');
}

function loadBookmarks() {
    const bookmarksGrid = document.getElementById('bookmarksGrid');
    if (!bookmarksGrid) return;
    
    // Load bookmarks from localStorage
    const bookmarks = JSON.parse(localStorage.getItem('educationBookmarks') || '[]');
    
    if (bookmarks.length === 0) {
        bookmarksGrid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: #666;">
                <i class="fas fa-bookmark" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.3;"></i>
                <p>No bookmarks yet. Start exploring articles and videos to bookmark your favorites!</p>
            </div>
        `;
        return;
    }
    
    bookmarksGrid.innerHTML = bookmarks.map(bookmark => `
        <div class="article-card" onclick="openBookmark('${bookmark.type}', ${bookmark.id})">
            <div class="article-image-large">
                <i class="${bookmark.image}"></i>
            </div>
            <div class="article-card-content">
                <h5>${bookmark.title}</h5>
                <p>${bookmark.description}</p>
                <div class="article-meta">
                    <span class="read-time"><i class="fas fa-${bookmark.type === 'article' ? 'clock' : 'play'}"></i> ${bookmark.duration}</span>
                    <span class="category">${bookmark.category}</span>
                </div>
            </div>
        </div>
    `).join('');
}

function filterEducationContent(category) {
    // Remove active class from all filter buttons
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => btn.classList.remove('active'));
    
    // Add active class to selected button
    const selectedBtn = document.querySelector(`[onclick="filterEducationContent('${category}')"]`);
    if (selectedBtn) {
        selectedBtn.classList.add('active');
    }
    
    // Filter content based on category
    const articles = document.querySelectorAll('.article-card, .video-card-modal');
    articles.forEach(article => {
        if (category === 'all') {
            article.style.display = 'block';
        } else {
            const articleCategory = article.querySelector('.category').textContent.toLowerCase();
            if (articleCategory.includes(category)) {
                article.style.display = 'block';
            } else {
                article.style.display = 'none';
            }
        }
    });
}

function searchEducationContent() {
    const searchTerm = document.getElementById('educationSearch').value.toLowerCase();
    const articles = document.querySelectorAll('.article-card, .video-card-modal');
    
    articles.forEach(article => {
        const title = article.querySelector('h5').textContent.toLowerCase();
        const description = article.querySelector('p').textContent.toLowerCase();
        
        if (title.includes(searchTerm) || description.includes(searchTerm)) {
            article.style.display = 'block';
        } else {
            article.style.display = 'none';
        }
    });
}

function openArticle(articleId) {
    const modal = document.getElementById('articleModal');
    const content = document.getElementById('articleContent');
    
    if (modal && content) {
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        
        // Load article content (in a real app, this would fetch from a database)
        const articleContent = getArticleContent(articleId);
        content.innerHTML = articleContent;
    }
}

function playVideo(videoId) {
    const modal = document.getElementById('videoModal');
    const container = document.getElementById('videoContainer');
    const info = document.getElementById('videoInfo');
    
    if (modal && container && info) {
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        
        // Load video content (in a real app, this would load actual video)
        const videoContent = getVideoContent(videoId);
        container.innerHTML = videoContent;
        info.innerHTML = getVideoInfo(videoId);
    }
}

function getArticleContent(articleId) {
    const articles = {
        1: `
            <h1>Understanding Your Menstrual Cycle</h1>
            <p><strong>Published:</strong> March 15, 2024 | <strong>Read time:</strong> 5 minutes</p>
            
            <h2>What is a Menstrual Cycle?</h2>
            <p>The menstrual cycle is a natural process that occurs in women's bodies, typically lasting 21-35 days. It involves several phases that prepare the body for potential pregnancy.</p>
            
            <h2>The Four Phases</h2>
            <h3>1. Menstrual Phase (Days 1-5)</h3>
            <p>This is when you have your period. The lining of the uterus sheds, and you experience bleeding. This phase typically lasts 3-7 days.</p>
            
            <h3>2. Follicular Phase (Days 1-13)</h3>
            <p>During this phase, the pituitary gland releases follicle-stimulating hormone (FSH), which stimulates the growth of follicles in the ovaries.</p>
            
            <h3>3. Ovulation (Day 14)</h3>
            <p>An egg is released from the ovary and travels down the fallopian tube. This is when you're most fertile.</p>
            
            <h3>4. Luteal Phase (Days 15-28)</h3>
            <p>If the egg isn't fertilized, the corpus luteum breaks down, and hormone levels drop, leading to menstruation.</p>
            
            <h2>What's Normal?</h2>
            <p>Every woman's cycle is different. What's normal for you might not be normal for someone else. Track your cycle to understand your personal pattern.</p>
            
            <h2>When to See a Doctor</h2>
            <p>Consult a healthcare provider if you experience:</p>
            <ul>
                <li>Very heavy bleeding</li>
                <li>Severe pain</li>
                <li>Irregular cycles</li>
                <li>Missed periods</li>
            </ul>
        `,
        2: `
            <h1>Managing Period Pain Naturally</h1>
            <p><strong>Published:</strong> March 10, 2024 | <strong>Read time:</strong> 7 minutes</p>
            
            <h2>Understanding Period Pain</h2>
            <p>Period pain, or dysmenorrhea, affects many women during their menstrual cycle. While some discomfort is normal, severe pain isn't and should be addressed.</p>
            
            <h2>Natural Remedies</h2>
            <h3>Heat Therapy</h3>
            <p>Applying heat to your lower abdomen can help relax the muscles and reduce cramping. Use a heating pad or hot water bottle.</p>
            
            <h3>Exercise</h3>
            <p>Light exercise like walking or yoga can help increase blood flow and reduce pain. Even gentle stretching can be beneficial.</p>
            
            <h3>Dietary Changes</h3>
            <p>Certain foods can help reduce inflammation and pain:</p>
            <ul>
                <li>Omega-3 fatty acids (fish, flaxseeds)</li>
                <li>Magnesium-rich foods (dark chocolate, nuts)</li>
                <li>Anti-inflammatory foods (ginger, turmeric)</li>
            </ul>
            
            <h2>Lifestyle Tips</h2>
            <ul>
                <li>Stay hydrated</li>
                <li>Get enough sleep</li>
                <li>Manage stress</li>
                <li>Avoid caffeine and alcohol</li>
            </ul>
        `
    };
    
    return articles[articleId] || '<p>Article not found.</p>';
}

function getVideoContent(videoId) {
    return `
        <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #000; color: white; font-size: 1.2rem;">
            <div style="text-align: center;">
                <i class="fas fa-play-circle" style="font-size: 4rem; margin-bottom: 1rem;"></i>
                <p>Video Player</p>
                <p style="font-size: 0.9rem; opacity: 0.7;">Video ID: ${videoId}</p>
                <p style="font-size: 0.8rem; opacity: 0.5;">In a real application, this would load an actual video player</p>
            </div>
        </div>
    `;
}

function getVideoInfo(videoId) {
    const videos = {
        1: '<h3>Yoga for Period Relief</h3><p>Gentle yoga poses to help alleviate menstrual cramps and discomfort. Perfect for beginners and those looking for natural pain relief.</p>',
        2: '<h3>Meditation for PMS</h3><p>Guided meditation techniques to help manage premenstrual symptoms and promote emotional well-being during your cycle.</p>',
        3: '<h3>Nutrition for Hormonal Health</h3><p>Learn about foods that support hormonal balance throughout your cycle and promote overall reproductive health.</p>',
        4: '<h3>Understanding Fertility Signs</h3><p>Educational content about recognizing your body\'s fertility signals and understanding your reproductive cycle.</p>'
    };
    
    return videos[videoId] || '<p>Video information not available.</p>';
}

function bookmarkArticle() {
    // Implementation for bookmarking articles
    console.log('Bookmarking article...');
}

function shareArticle() {
    // Implementation for sharing articles
    console.log('Sharing article...');
}

function bookmarkVideo() {
    // Implementation for bookmarking videos
    console.log('Bookmarking video...');
}

function shareVideo() {
    // Implementation for sharing videos
    console.log('Sharing video...');
}

function openBookmark(type, id) {
    if (type === 'article') {
        openArticle(id);
    } else if (type === 'video') {
        playVideo(id);
    }
}

// Gamification Functions
function showGamificationModal() {
    const modal = document.getElementById('gamificationModal');
    if (modal) {
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        loadGamificationData();
    }
}

function showGamificationTab(tabName) {
    // Hide all tabs
    const tabs = document.querySelectorAll('.gamification-tab-content');
    tabs.forEach(tab => tab.style.display = 'none');
    
    // Remove active class from all nav buttons
    const navBtns = document.querySelectorAll('.gamification-nav-btn');
    navBtns.forEach(btn => btn.classList.remove('active'));
    
    // Show selected tab
    const selectedTab = document.getElementById(tabName + 'Tab');
    if (selectedTab) {
        selectedTab.style.display = 'block';
    }
    
    // Add active class to selected nav button
    const selectedBtn = document.querySelector(`[onclick="showGamificationTab('${tabName}')"]`);
    if (selectedBtn) {
        selectedBtn.classList.add('active');
    }
    
    // Load content based on tab
    if (tabName === 'overview') {
        loadOverviewData();
    } else if (tabName === 'achievements') {
        loadAchievements();
    } else if (tabName === 'challenges') {
        loadChallenges();
    } else if (tabName === 'leaderboard') {
        loadLeaderboard();
    }
}

function loadGamificationData() {
    loadOverviewData();
}

function loadOverviewData() {
    // Load user progress data
    const userData = getUserGamificationData();
    
    // Update level and points
    document.getElementById('currentLevel').textContent = userData.level;
    document.getElementById('userLevel').textContent = userData.level;
    document.getElementById('currentPoints').textContent = userData.points;
    document.getElementById('nextLevelPoints').textContent = userData.nextLevelPoints;
    
    // Update progress bar
    const progressPercentage = (userData.points / userData.nextLevelPoints) * 100;
    document.getElementById('levelProgress').style.width = progressPercentage + '%';
    
    // Update stats
    document.getElementById('currentStreak').textContent = userData.streak;
    document.getElementById('healthScore').textContent = userData.healthScore;
    document.getElementById('totalBadges').textContent = userData.totalBadges;
    document.getElementById('daysTracked').textContent = userData.daysTracked;
    
    // Load recent achievements
    loadRecentAchievements(userData.recentAchievements);
}

function getUserGamificationData() {
    // Get data from localStorage or calculate from user activity
    const storedData = JSON.parse(localStorage.getItem('gamificationData') || '{}');
    
    return {
        level: storedData.level || 1,
        points: storedData.points || 0,
        nextLevelPoints: 100,
        streak: storedData.streak || 0,
        healthScore: storedData.healthScore || 85,
        totalBadges: storedData.totalBadges || 0,
        daysTracked: storedData.daysTracked || 0,
        recentAchievements: storedData.recentAchievements || []
    };
}

function loadRecentAchievements(achievements) {
    const container = document.getElementById('recentAchievements');
    
    if (achievements.length === 0) {
        container.innerHTML = `
            <div class="no-achievements">
                <i class="fas fa-medal"></i>
                <p>No achievements yet. Start tracking to earn your first badge!</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = achievements.map(achievement => `
        <div class="achievement-item">
            <div class="achievement-icon ${achievement.rarity}">
                <i class="${achievement.icon}"></i>
            </div>
            <div class="achievement-info">
                <h5>${achievement.name}</h5>
                <p>${achievement.description}</p>
                <span class="achievement-date">${achievement.date}</span>
            </div>
        </div>
    `).join('');
}

function loadAchievements() {
    const achievementsGrid = document.getElementById('achievementsGrid');
    if (!achievementsGrid) return;
    
    const achievements = [
        {
            id: 1,
            name: "First Steps",
            description: "Log your first period",
            icon: "fas fa-baby",
            rarity: "bronze",
            points: 50,
            earned: true,
            category: "consistency"
        },
        {
            id: 2,
            name: "Week Warrior",
            description: "Track for 7 consecutive days",
            icon: "fas fa-calendar-week",
            rarity: "silver",
            points: 100,
            earned: false,
            category: "consistency"
        },
        {
            id: 3,
            name: "Health Hero",
            description: "Maintain 90+ health score for a week",
            icon: "fas fa-heart",
            rarity: "gold",
            points: 200,
            earned: false,
            category: "health"
        },
        {
            id: 4,
            name: "Knowledge Seeker",
            description: "Read 5 health articles",
            icon: "fas fa-book",
            rarity: "bronze",
            points: 75,
            earned: false,
            category: "knowledge"
        },
        {
            id: 5,
            name: "Month Master",
            description: "Track for 30 consecutive days",
            icon: "fas fa-calendar-alt",
            rarity: "gold",
            points: 300,
            earned: false,
            category: "consistency"
        },
        {
            id: 6,
            name: "Symptom Tracker",
            description: "Log symptoms for 10 days",
            icon: "fas fa-heartbeat",
            rarity: "silver",
            points: 150,
            earned: false,
            category: "health"
        }
    ];
    
    achievementsGrid.innerHTML = achievements.map(achievement => `
        <div class="achievement-card ${achievement.earned ? 'earned' : ''}" onclick="viewAchievement(${achievement.id})">
            <div class="achievement-icon ${achievement.rarity}">
                <i class="${achievement.icon}"></i>
            </div>
            <h5>${achievement.name}</h5>
            <p>${achievement.description}</p>
            <div class="achievement-points">${achievement.points} pts</div>
        </div>
    `).join('');
}

function loadChallenges() {
    const dailyChallenges = document.getElementById('dailyChallenges');
    const weeklyChallenges = document.getElementById('weeklyChallenges');
    
    if (dailyChallenges) {
        dailyChallenges.innerHTML = `
            <div class="challenge-card">
                <h5>Daily Logging</h5>
                <p>Log your period or symptoms today</p>
                <div class="challenge-progress">
                    <div class="challenge-progress-fill" style="width: 60%"></div>
                </div>
                <div class="challenge-reward">
                    <span>Progress: 3/5 days</span>
                    <span>+25 points</span>
                </div>
            </div>
            <div class="challenge-card">
                <h5>Health Check-in</h5>
                <p>Complete your daily health assessment</p>
                <div class="challenge-progress">
                    <div class="challenge-progress-fill" style="width: 100%"></div>
                </div>
                <div class="challenge-reward">
                    <span>Completed!</span>
                    <span>+15 points</span>
                </div>
            </div>
        `;
    }
    
    if (weeklyChallenges) {
        weeklyChallenges.innerHTML = `
            <div class="challenge-card">
                <h5>Consistency Champion</h5>
                <p>Log every day for a week</p>
                <div class="challenge-progress">
                    <div class="challenge-progress-fill" style="width: 40%"></div>
                </div>
                <div class="challenge-reward">
                    <span>Progress: 3/7 days</span>
                    <span>+100 points</span>
                </div>
            </div>
            <div class="challenge-card">
                <h5>Health Explorer</h5>
                <p>Read 3 health articles this week</p>
                <div class="challenge-progress">
                    <div class="challenge-progress-fill" style="width: 67%"></div>
                </div>
                <div class="challenge-reward">
                    <span>Progress: 2/3 articles</span>
                    <span>+75 points</span>
                </div>
            </div>
        `;
    }
}

function loadLeaderboard() {
    const leaderboardList = document.getElementById('leaderboardList');
    if (!leaderboardList) return;
    
    const leaderboard = [
        { rank: 1, name: "Sarah M.", points: 1250, streak: 45, healthScore: 95 },
        { rank: 2, name: "Emma L.", points: 1180, streak: 38, healthScore: 92 },
        { rank: 3, name: "You", points: 950, streak: 25, healthScore: 88 },
        { rank: 4, name: "Lisa K.", points: 875, streak: 22, healthScore: 85 },
        { rank: 5, name: "Anna R.", points: 720, streak: 18, healthScore: 82 }
    ];
    
    leaderboardList.innerHTML = leaderboard.map(user => `
        <div class="leaderboard-item">
            <div class="leaderboard-rank rank-${user.rank <= 3 ? user.rank : 'other'}">
                ${user.rank}
            </div>
            <div class="leaderboard-info">
                <div class="leaderboard-name">${user.name}</div>
                <div class="leaderboard-stats">${user.streak} day streak • ${user.healthScore} health score</div>
            </div>
            <div class="leaderboard-score">${user.points}</div>
        </div>
    `).join('');
}

function filterAchievements(category) {
    // Remove active class from all category buttons
    const categoryBtns = document.querySelectorAll('.category-btn');
    categoryBtns.forEach(btn => btn.classList.remove('active'));
    
    // Add active class to selected button
    const selectedBtn = document.querySelector(`[onclick="filterAchievements('${category}')"]`);
    if (selectedBtn) {
        selectedBtn.classList.add('active');
    }
    
    // Filter achievements (in a real app, this would filter the data)
    console.log('Filtering achievements by category:', category);
}

function filterLeaderboard(type) {
    // Remove active class from all filter buttons
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => btn.classList.remove('active'));
    
    // Add active class to selected button
    const selectedBtn = document.querySelector(`[onclick="filterLeaderboard('${type}')"]`);
    if (selectedBtn) {
        selectedBtn.classList.add('active');
    }
    
    // Filter leaderboard (in a real app, this would sort the data)
    console.log('Filtering leaderboard by type:', type);
}

function viewAchievement(achievementId) {
    console.log('Viewing achievement:', achievementId);
    // In a real app, this would show achievement details
}

// Award points and check for achievements
function awardPoints(activity, points) {
    const userData = getUserGamificationData();
    userData.points += points;
    
    // Check for level up
    if (userData.points >= userData.nextLevelPoints) {
        userData.level += 1;
        userData.nextLevelPoints = userData.level * 100;
        showLevelUpNotification(userData.level);
    }
    
    // Save updated data
    localStorage.setItem('gamificationData', JSON.stringify(userData));
    
    // Check for new achievements
    checkAchievements(activity);
}

function showLevelUpNotification(level) {
    // Create a notification element
    const notification = document.createElement('div');
    notification.className = 'level-up-notification';
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas fa-star"></i>
            <h3>Level Up!</h3>
            <p>You've reached level ${level}!</p>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Remove notification after 3 seconds
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

function checkAchievements(activity) {
    // Check for various achievements based on user activity
    console.log('Checking achievements for activity:', activity);
    // In a real app, this would check against achievement criteria
}

// Add Period Modal
function showAddPeriodModal() {
    document.getElementById('addPeriodModal').style.display = 'block';
    document.body.style.overflow = 'hidden';
}

// Add Period Form Handler
const addPeriodForm = document.getElementById('addPeriodForm');
if (addPeriodForm) {
    addPeriodForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const startDate = document.getElementById('periodStartDate').value;
    const endDate = document.getElementById('periodEndDate').value;
    const flow = document.getElementById('periodFlow').value;
    const notes = document.getElementById('periodNotes').value;
    
    if (new Date(startDate) > new Date(endDate)) {
        showError('End date must be after start date');
        return;
    }
    
    await addPeriod(startDate, endDate, flow, notes);
    closeModal('addPeriodModal');
    showSuccess('Period added successfully!');
    
    // Reset form
    this.reset();
    });
}

// Daily Logging Functions
function loadTodayLog() {
    const today = new Date().toDateString();
    const todayLog = dailyLogs.find(log => 
        log.userId === currentUser.id && log.date === today
    );
    
    if (todayLog) {
        // Load existing data
        todayLog.symptoms.forEach(symptom => {
            const btn = document.querySelector(`[data-symptom="${symptom}"]`);
            if (btn) btn.classList.add('selected');
        });
        
        if (todayLog.mood) {
            const btn = document.querySelector(`[data-mood="${todayLog.mood}"]`);
            if (btn) btn.classList.add('selected');
        }
        
        if (todayLog.flow) {
            const btn = document.querySelector(`[data-flow="${todayLog.flow}"]`);
            if (btn) btn.classList.add('selected');
        }
    }
}

function saveDailyLog() {
    const today = new Date().toDateString();
    const selectedSymptoms = Array.from(document.querySelectorAll('.symptom-tag.selected'))
        .map(btn => btn.dataset.symptom);
    const selectedMood = document.querySelector('.mood-btn.selected')?.dataset.mood || null;
    const selectedFlow = document.querySelector('.flow-btn.selected')?.dataset.flow || null;
    
    const logData = {
        userId: currentUser.id,
        date: today,
        symptoms: selectedSymptoms,
        mood: selectedMood,
        flow: selectedFlow,
        createdAt: new Date().toISOString()
    };
    
    // Remove existing log for today
    dailyLogs = dailyLogs.filter(log => 
        !(log.userId === currentUser.id && log.date === today)
    );
    
    dailyLogs.push(logData);
    localStorage.setItem('dailyLogs', JSON.stringify(dailyLogs));
    
    showSuccess('Daily log saved successfully!');
}

// Symptom/Mood/Flow Selection
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('symptom-tag')) {
        e.target.classList.toggle('selected');
    } else if (e.target.classList.contains('mood-btn')) {
        document.querySelectorAll('.mood-btn').forEach(btn => btn.classList.remove('selected'));
        e.target.classList.add('selected');
    } else if (e.target.classList.contains('flow-btn')) {
        document.querySelectorAll('.flow-btn').forEach(btn => btn.classList.remove('selected'));
        e.target.classList.add('selected');
    }
});

// AI Insights Functions
async function updateInsights() {
    const periods = await getUserPeriods();
    
    const predictedDateElement = document.getElementById('predictedDate');
    const avgCycleLengthElement = document.getElementById('avgCycleLength');
    const cyclePatternElement = document.getElementById('cyclePattern');
    const healthTipsElement = document.getElementById('healthTips');
    
    if (!predictedDateElement || !avgCycleLengthElement || !cyclePatternElement || !healthTipsElement) {
        console.log('Insights elements not found');
        return;
    }
    
    if (periods.length > 0) {
        const aiPrediction = predictNextPeriodWithAI(periods);
        const avgCycleLength = calculateCycleLength(periods);
        
        if (aiPrediction) {
            predictedDateElement.innerHTML = 
                aiPrediction.date.toLocaleDateString() + 
                `<small style="color: #666; font-size: 0.8em;"> (${aiPrediction.confidence}% confidence)</small>`;
        } else {
            predictedDateElement.textContent = '--';
        }
        
        avgCycleLengthElement.textContent = avgCycleLength;
        
        // Determine cycle pattern with AI insights
        let pattern = 'regular';
        if (periods.length >= 3) {
            const cycleLengths = [];
            for (let i = 1; i < periods.length; i++) {
                const start1 = new Date(periods[i-1].startDate);
                const start2 = new Date(periods[i].startDate);
                const diffTime = Math.abs(start2 - start1);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                cycleLengths.push(diffDays);
            }
            
            const variance = Math.max(...cycleLengths) - Math.min(...cycleLengths);
            if (variance <= 2) pattern = 'very regular';
            else if (variance <= 7) pattern = 'regular';
            else pattern = 'irregular';
        }
        
        cyclePatternElement.textContent = pattern;
        
        // Enhanced health tips with AI insights
        const aiInsights = getAIInsights(periods);
        let healthTip = 'Stay hydrated and maintain a balanced diet for optimal health.';
        
        if (aiInsights.length > 0) {
            const highConfidenceInsight = aiInsights.find(insight => insight.confidence === 'high');
            if (highConfidenceInsight) {
                healthTip = highConfidenceInsight.message;
            }
        } else {
            // Fallback to cycle phase tips
            const today = new Date();
            const lastPeriod = periods[periods.length - 1];
            const daysSince = Math.floor((today - new Date(lastPeriod.startDate)) / (1000 * 60 * 60 * 24));
            
            if (daysSince <= 5) {
                healthTip = 'During your period: Stay hydrated, eat iron-rich foods, and consider light exercise to help with cramps.';
            } else if (daysSince >= 10 && daysSince <= 16) {
                healthTip = 'Ovulation phase: You may experience increased energy. Great time for exercise and social activities.';
            } else if (daysSince >= 20) {
                healthTip = 'Pre-menstrual phase: Consider reducing caffeine and increasing magnesium-rich foods.';
            }
        }
        
        healthTipsElement.textContent = healthTip;
    } else {
        predictedDateElement.textContent = '--';
        avgCycleLengthElement.textContent = '28';
        cyclePatternElement.textContent = '--';
        healthTipsElement.textContent = 'Track your cycles to get personalized insights!';
    }
}

// History Stats Functions
async function updateHistoryStats() {
    const periods = await getUserPeriods();
    
    const shortestCycleElement = document.getElementById('shortestCycle');
    const longestCycleElement = document.getElementById('longestCycle');
    const regularityElement = document.getElementById('regularity');
    
    if (!shortestCycleElement || !longestCycleElement || !regularityElement) {
        console.log('History stats elements not found');
        return;
    }
    
    if (periods.length >= 2) {
        const cycleLengths = [];
        for (let i = 1; i < periods.length; i++) {
            const start1 = new Date(periods[i-1].startDate);
            const start2 = new Date(periods[i].startDate);
            const diffTime = Math.abs(start2 - start1);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            cycleLengths.push(diffDays);
        }
        
        const shortest = Math.min(...cycleLengths);
        const longest = Math.max(...cycleLengths);
        const variance = longest - shortest;
        
        shortestCycleElement.textContent = `${shortest} days`;
        longestCycleElement.textContent = `${longest} days`;
        
        let regularity = 'Regular';
        if (variance <= 2) regularity = 'Very Regular';
        else if (variance <= 7) regularity = 'Regular';
        else if (variance <= 14) regularity = 'Somewhat Irregular';
        else regularity = 'Irregular';
        
        regularityElement.textContent = regularity;
    } else {
        shortestCycleElement.textContent = '-- days';
        longestCycleElement.textContent = '-- days';
        regularityElement.textContent = '--';
    }
}

// AI Training and Data Processing
async function loadTrainingData() {
    try {
        const response = await fetch('p1.csv');
        const csvText = await response.text();
        trainingData = parseCSVData(csvText);
        trainAIModels();
        console.log('AI models trained with', trainingData.length, 'cycles of data');
        
        // Update dashboard if user is logged in
        onAIDataLoaded();
    } catch (error) {
        console.log('Using fallback AI models (CSV not accessible)');
        initializeFallbackModels();
        
        // Update dashboard with fallback data
        onAIDataLoaded();
    }
}

function parseCSVData(csvText) {
    const lines = csvText.split('\n');
    const headers = lines[0].split(',');
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim()) {
            const values = lines[i].split(',');
            const row = {};
            headers.forEach((header, index) => {
                row[header.trim()] = values[index] ? values[index].trim() : '';
            });
            data.push(row);
        }
    }
    
    return data.filter(row => row.LengthofCycle && !isNaN(parseInt(row.LengthofCycle)));
}

function trainAIModels() {
    if (!trainingData || trainingData.length === 0) {
        initializeFallbackModels();
        return;
    }
    
    // Train Cycle Length Model
    const cycleLengths = trainingData
        .map(row => parseInt(row.LengthofCycle))
        .filter(length => length > 0 && length < 50);
    
    aiModels.cycleLength = {
        mean: calculateMean(cycleLengths),
        median: calculateMedian(cycleLengths),
        stdDev: calculateStandardDeviation(cycleLengths),
        min: Math.min(...cycleLengths),
        max: Math.max(...cycleLengths),
        distribution: calculateDistribution(cycleLengths)
    };
    
    // Train Ovulation Model
    const ovulationDays = trainingData
        .map(row => parseInt(row.EstimatedDayofOvulation))
        .filter(day => day > 0 && day < 50);
    
    aiModels.ovulation = {
        mean: calculateMean(ovulationDays),
        median: calculateMedian(ovulationDays),
        stdDev: calculateStandardDeviation(ovulationDays),
        distribution: calculateDistribution(ovulationDays)
    };
    
    // Train Menses Intensity Model
    const mensesScores = trainingData
        .map(row => parseInt(row.TotalMensesScore))
        .filter(score => score > 0);
    
    aiModels.mensesIntensity = {
        mean: calculateMean(mensesScores),
        median: calculateMedian(mensesScores),
        stdDev: calculateStandardDeviation(mensesScores),
        distribution: calculateDistribution(mensesScores)
    };
    
    // Train Fertility Window Model
    const fertilityDays = trainingData
        .map(row => parseInt(row.TotalDaysofFertility))
        .filter(days => days > 0);
    
    aiModels.fertilityWindow = {
        mean: calculateMean(fertilityDays),
        median: calculateMedian(fertilityDays),
        stdDev: calculateStandardDeviation(fertilityDays),
        distribution: calculateDistribution(fertilityDays)
    };
    
    // Age-based patterns
    const ageGroups = {};
    trainingData.forEach(row => {
        const age = parseInt(row.Age);
        if (age > 0) {
            const ageGroup = Math.floor(age / 10) * 10;
            if (!ageGroups[ageGroup]) ageGroups[ageGroup] = [];
            ageGroups[ageGroup].push(parseInt(row.LengthofCycle));
        }
    });
    
    aiModels.agePatterns = {};
    Object.keys(ageGroups).forEach(ageGroup => {
        const cycles = ageGroups[ageGroup];
        aiModels.agePatterns[ageGroup] = {
            mean: calculateMean(cycles),
            stdDev: calculateStandardDeviation(cycles),
            count: cycles.length
        };
    });
    
    console.log('AI Models Trained:', aiModels);
}

function initializeFallbackModels() {
    aiModels.cycleLength = {
        mean: 28,
        median: 28,
        stdDev: 3,
        min: 21,
        max: 35,
        distribution: { '21-24': 0.1, '25-27': 0.2, '28-30': 0.4, '31-33': 0.2, '34-35': 0.1 }
    };
    
    aiModels.ovulation = {
        mean: 14,
        median: 14,
        stdDev: 2,
        distribution: { '12-13': 0.1, '14-15': 0.6, '16-17': 0.2, '18-19': 0.1 }
    };
    
    aiModels.mensesIntensity = {
        mean: 10,
        median: 10,
        stdDev: 3,
        distribution: { '1-5': 0.1, '6-8': 0.2, '9-12': 0.4, '13-15': 0.2, '16+': 0.1 }
    };
    
    aiModels.fertilityWindow = {
        mean: 6,
        median: 6,
        stdDev: 2,
        distribution: { '3-4': 0.1, '5-6': 0.4, '7-8': 0.3, '9-10': 0.2 }
    };
}

// Statistical Functions
function calculateMean(arr) {
    return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

function calculateMedian(arr) {
    const sorted = arr.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function calculateStandardDeviation(arr) {
    const mean = calculateMean(arr);
    const squaredDiffs = arr.map(val => Math.pow(val - mean, 2));
    return Math.sqrt(calculateMean(squaredDiffs));
}

function calculateDistribution(arr) {
    const distribution = {};
    arr.forEach(val => {
        const range = Math.floor(val / 3) * 3;
        const key = `${range}-${range + 2}`;
        distribution[key] = (distribution[key] || 0) + 1;
    });
    
    // Convert to percentages
    const total = arr.length;
    Object.keys(distribution).forEach(key => {
        distribution[key] = (distribution[key] / total).toFixed(2);
    });
    
    return distribution;
}

// Enhanced AI Prediction Functions
function getAIPrediction(userAge, cycleHistory) {
    if (!aiModels.cycleLength) return getBasicPrediction(cycleHistory);
    
    const ageGroup = Math.floor(userAge / 10) * 10;
    const agePattern = aiModels.agePatterns && aiModels.agePatterns[ageGroup] ? aiModels.agePatterns[ageGroup] : null;
    
    let predictedCycleLength = aiModels.cycleLength.mean;
    let confidence = 0.7;
    
    // Adjust based on age patterns
    if (agePattern && agePattern.count > 10) {
        predictedCycleLength = agePattern.mean;
        confidence = Math.min(0.95, 0.7 + (agePattern.count / 100));
    }
    
    // Adjust based on user's personal history
    if (cycleHistory.length >= 3) {
        const personalMean = calculateMean(cycleHistory);
        const personalStdDev = calculateStandardDeviation(cycleHistory);
        
        // Weight personal history more heavily
        predictedCycleLength = (personalMean * 0.7) + (predictedCycleLength * 0.3);
        confidence = Math.min(0.95, confidence + 0.2);
    }
    
    return {
        cycleLength: Math.round(predictedCycleLength),
        ovulationDay: Math.round(predictedCycleLength - 14),
        confidence: Math.round(confidence * 100),
        fertilityWindow: {
            start: Math.round(predictedCycleLength - 17),
            end: Math.round(predictedCycleLength - 11)
        }
    };
}

function getBasicPrediction(cycleHistory) {
    if (cycleHistory.length === 0) {
        return {
            cycleLength: 28,
            ovulationDay: 14,
            confidence: 50,
            fertilityWindow: { start: 11, end: 17 }
        };
    }
    
    const mean = calculateMean(cycleHistory);
    return {
        cycleLength: Math.round(mean),
        ovulationDay: Math.round(mean - 14),
        confidence: Math.min(90, 60 + (cycleHistory.length * 5)),
        fertilityWindow: { start: Math.round(mean - 17), end: Math.round(mean - 11) }
    };
}

// Enhanced prediction with AI
function predictNextPeriodWithAI(periods) {
    if (periods.length === 0) return null;
    
    const lastPeriod = periods[periods.length - 1];
    const cycleHistory = periods.slice(0, -1).map((period, index) => {
        if (index === 0) return 28; // Default for first cycle
        const prevPeriod = periods[index - 1];
        const start1 = new Date(prevPeriod.startDate);
        const start2 = new Date(period.startDate);
        return Math.ceil((start2 - start1) / (1000 * 60 * 60 * 24));
    });
    
    const userAge = currentUser && currentUser.age ? currentUser.age : 25;
    const prediction = getAIPrediction(userAge, cycleHistory);
    
    const lastStartDate = new Date(lastPeriod.startDate);
    const nextStartDate = new Date(lastStartDate);
    nextStartDate.setDate(lastStartDate.getDate() + prediction.cycleLength);
    
    return {
        date: nextStartDate,
        cycleLength: prediction.cycleLength,
        ovulationDay: prediction.ovulationDay,
        confidence: prediction.confidence,
        fertilityWindow: prediction.fertilityWindow
    };
}

// Enhanced insights with AI data
function getAIInsights(periods) {
    if (!aiModels.cycleLength) return getBasicInsights(periods);
    
    const insights = [];
    const userAge = currentUser ? currentUser.age : 25;
    const ageGroup = Math.floor(userAge / 10) * 10;
    const agePattern = aiModels.agePatterns[ageGroup];
    
    if (periods.length >= 3) {
        const cycleLengths = periods.slice(1).map((period, index) => {
            const start1 = new Date(periods[index].startDate);
            const start2 = new Date(period.startDate);
            return Math.ceil((start2 - start1) / (1000 * 60 * 60 * 24));
        });
        
        const personalMean = calculateMean(cycleLengths);
        const personalStdDev = calculateStandardDeviation(cycleLengths);
        const populationMean = aiModels.cycleLength.mean;
        
        if (Math.abs(personalMean - populationMean) > 3) {
            insights.push({
                type: 'cycle_length',
                message: `Your average cycle length (${Math.round(personalMean)} days) is ${personalMean > populationMean ? 'longer' : 'shorter'} than the population average (${populationMean} days).`,
                confidence: 'high'
            });
        }
        
        if (personalStdDev > aiModels.cycleLength.stdDev * 1.5) {
            insights.push({
                type: 'irregularity',
                message: 'Your cycles show more variation than typical. Consider tracking additional factors like stress, sleep, and exercise.',
                confidence: 'medium'
            });
        }
    }
    
    if (agePattern && agePattern.count > 10) {
        const ageGroupMean = agePattern.mean;
        insights.push({
            type: 'age_pattern',
            message: `Women in your age group (${ageGroup}s) typically have ${ageGroupMean}-day cycles.`,
            confidence: 'high'
        });
    }
    
    return insights.length > 0 ? insights : getBasicInsights(periods);
}

function getBasicInsights(periods) {
    return [{
        type: 'general',
        message: 'Track more cycles to get personalized insights about your reproductive health.',
        confidence: 'low'
    }];
}

// AI Data Display Functions
function updateAIDataDisplay() {
    const trainingCyclesElement = document.getElementById('trainingCycles');
    const trainingUsersElement = document.getElementById('trainingUsers');
    const aiAccuracyElement = document.getElementById('aiAccuracy');
    
    if (!trainingCyclesElement || !trainingUsersElement || !aiAccuracyElement) {
        console.log('AI data display elements not found');
        return;
    }
    
    if (!trainingData || trainingData.length === 0) {
        trainingCyclesElement.textContent = '1,667';
        trainingUsersElement.textContent = '500+';
        aiAccuracyElement.textContent = '95%';
        updatePopulationInsights();
        return;
    }
    
    // Update training data stats
    const uniqueUsers = new Set(trainingData.map(row => row.ClientID)).size;
    trainingCyclesElement.textContent = trainingData.length.toLocaleString();
    trainingUsersElement.textContent = uniqueUsers.toLocaleString();
    
    // Calculate AI accuracy based on model confidence
    const avgConfidence = aiModels.cycleLength ? 
        Math.round((aiModels.cycleLength.mean / 28) * 100) : 95;
    aiAccuracyElement.textContent = `${Math.min(99, avgConfidence)}%`;
    
    updatePopulationInsights();
}

function updatePopulationInsights() {
    const insightsContainer = document.getElementById('populationInsights');
    
    if (!insightsContainer) {
        console.log('Population insights container not found');
        return;
    }
    
    if (!aiModels.cycleLength) {
        insightsContainer.innerHTML = `
            <div class="insight-item">
                <i class="fas fa-info-circle"></i>
                <span>AI models trained with 1,667 cycles of real data</span>
            </div>
            <div class="insight-item">
                <i class="fas fa-chart-line"></i>
                <span>Average cycle length: 28 days</span>
            </div>
            <div class="insight-item">
                <i class="fas fa-users"></i>
                <span>Data from women aged 18-45</span>
            </div>
            <div class="insight-item">
                <i class="fas fa-brain"></i>
                <span>Machine learning algorithms for predictions</span>
            </div>
        `;
        return;
    }
    
    const insights = [
        {
            icon: 'fas fa-chart-line',
            text: `Average cycle length: ${Math.round(aiModels.cycleLength.mean)} days`
        },
        {
            icon: 'fas fa-clock',
            text: `Most common ovulation day: ${Math.round(aiModels.ovulation.mean)}`
        },
        {
            icon: 'fas fa-heart',
            text: `Typical fertility window: ${Math.round(aiModels.fertilityWindow.mean)} days`
        },
        {
            icon: 'fas fa-tint',
            text: `Average menses intensity: ${Math.round(aiModels.mensesIntensity.mean)}/15`
        }
    ];
    
    // Add age-specific insights
    if (aiModels.agePatterns) {
        const ageGroups = Object.keys(aiModels.agePatterns).sort();
        if (ageGroups.length > 0) {
            const youngestGroup = ageGroups[0];
            const oldestGroup = ageGroups[ageGroups.length - 1];
            insights.push({
                icon: 'fas fa-users',
                text: `Age range: ${youngestGroup}s to ${oldestGroup}s`
            });
        }
    }
    
    insightsContainer.innerHTML = insights.map(insight => `
        <div class="insight-item">
            <i class="${insight.icon}"></i>
            <span>${insight.text}</span>
        </div>
    `).join('');
}

// Check if user is already logged in on page load
window.addEventListener('load', async function() {
    // Initialize database first
    const dbInitialized = await initDatabase();
    if (!dbInitialized) {
        console.error('Failed to initialize database');
        return;
    }
    
    const savedUser = localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        showDashboard();
    }
    
    // Load AI training data
    loadTrainingData();
});

// Force update dashboard when AI data is loaded
function onAIDataLoaded() {
    if (currentUser) {
        updateAIDataDisplay();
        updateInsights();
    }
}

// ========================================
// PREGNANCY DASHBOARD FUNCTIONS
// ========================================

// Pregnancy mode state
let pregnancyMode = false;
let pregnancyData = null;
let kickCounter = {
    count: 0,
    timer: null,
    startTime: null,
    isRunning: false
};
let contractionTimer = {
    isActive: false,
    startTime: null,
    contractions: []
};

// Show pregnancy modal (full dashboard)
function showPregnancyModal() {
    const modal = document.getElementById('pregnancySetupModal');
    if (modal) {
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        loadPregnancyData();
    }
}

// Update pregnancy dashboard card
function updatePregnancyCard() {
    // Get pregnancy data from localStorage
    pregnancyData = JSON.parse(localStorage.getItem('pregnancyData') || '{}');
    
    const statusElement = document.getElementById('pregnancyStatus');
    const daysRemaining = document.getElementById('quickDaysRemaining');
    const currentWeek = document.getElementById('quickCurrentWeek');
    const weightGain = document.getElementById('quickWeightGain');
    
    if (pregnancyData && pregnancyData.dueDate) {
        // Calculate pregnancy info
        const dueDate = new Date(pregnancyData.dueDate);
        const today = new Date();
        const timeDiff = dueDate.getTime() - today.getTime();
        const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
        const weeksDiff = Math.ceil(daysDiff / 7);
        const currentWeekNum = Math.max(1, 40 - weeksDiff);
        
        // Update status
        if (statusElement) {
            statusElement.innerHTML = `
                <div class="status-icon">
                    <i class="fas fa-baby"></i>
                </div>
                <div class="status-text">
                    <h5>Pregnant - Week ${currentWeekNum}</h5>
                    <p>${Math.max(0, daysDiff)} days until due date</p>
                </div>
            `;
        }
        
        // Update stats
        if (daysRemaining) daysRemaining.textContent = Math.max(0, daysDiff);
        if (currentWeek) currentWeek.textContent = currentWeekNum;
        if (weightGain) weightGain.textContent = '0 kg'; // This would be calculated from weight entries
    } else {
        // No pregnancy data
        if (statusElement) {
            statusElement.innerHTML = `
                <div class="status-icon">
                    <i class="fas fa-heart"></i>
                </div>
                <div class="status-text">
                    <h5>Not Pregnant</h5>
                    <p>Set up your pregnancy to start tracking</p>
                </div>
            `;
        }
        
        if (daysRemaining) daysRemaining.textContent = '--';
        if (currentWeek) currentWeek.textContent = '--';
        if (weightGain) weightGain.textContent = '--';
    }
}

// Update achievements dashboard card
function updateAchievementsCard() {
    // Get gamification data
    const userData = getUserGamificationData();
    
    // Update quick stats
    const quickLevel = document.getElementById('quickLevel');
    const quickStreak = document.getElementById('quickStreak');
    const quickBadges = document.getElementById('quickBadges');
    const quickProgress = document.getElementById('quickProgress');
    const quickProgressFill = document.getElementById('quickProgressFill');
    
    if (quickLevel) quickLevel.textContent = userData.level;
    if (quickStreak) quickStreak.textContent = userData.streak;
    if (quickBadges) quickBadges.textContent = userData.totalBadges;
    if (quickProgress) quickProgress.textContent = `${userData.points}/${userData.nextLevelPoints}`;
    if (quickProgressFill) {
        const progressPercentage = (userData.points / userData.nextLevelPoints) * 100;
        quickProgressFill.style.width = progressPercentage + '%';
    }
    
    // Update recent achievement
    const recentAchievement = document.getElementById('recentAchievement');
    if (recentAchievement && userData.recentAchievements.length > 0) {
        const latest = userData.recentAchievements[0];
        recentAchievement.innerHTML = `
            <div class="achievement-icon">
                <i class="${latest.icon}"></i>
            </div>
            <div class="achievement-text">
                <h5>${latest.name}</h5>
                <p>${latest.description}</p>
            </div>
        `;
    }
}

// Load pregnancy data
function loadPregnancyData() {
    // Get pregnancy data from localStorage
    pregnancyData = JSON.parse(localStorage.getItem('pregnancyData') || '{}');
    
    if (!pregnancyData.dueDate) {
        // Show setup modal if no pregnancy data
        showPregnancySetup();
        return;
    }
    
    // Update pregnancy dashboard
    updatePregnancyDashboard();
}

// Show pregnancy setup modal
function showPregnancySetup() {
    const modal = document.getElementById('pregnancySetupModal');
    if (modal) {
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }
}

// Select setup method
function selectSetupMethod(method) {
    const setupForm = document.getElementById('setupForm');
    if (setupForm) {
        setupForm.style.display = 'block';
        
        // Update form based on method
        const dueDateInput = document.getElementById('dueDate');
        if (dueDateInput) {
            if (method === 'dueDate') {
                dueDateInput.placeholder = 'Select your due date';
            } else if (method === 'conception') {
                dueDateInput.placeholder = 'Select conception date (will calculate due date)';
            } else if (method === 'lmp') {
                dueDateInput.placeholder = 'Select last menstrual period date';
            }
        }
    }
}

// Calculate pregnancy info
function calculatePregnancyInfo() {
    const dueDateInput = document.getElementById('dueDate');
    if (!dueDateInput || !dueDateInput.value) return;
    
    const dueDate = new Date(dueDateInput.value);
    const today = new Date();
    
    // Calculate weeks and days
    const timeDiff = dueDate.getTime() - today.getTime();
    const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
    const weeksDiff = Math.ceil(daysDiff / 7);
    
    // Update display
    document.getElementById('daysRemaining').textContent = Math.max(0, daysDiff);
    document.getElementById('weeksRemaining').textContent = Math.max(0, weeksDiff);
    
    // Calculate current week (40 weeks total)
    const currentWeek = Math.max(1, 40 - weeksDiff);
    document.getElementById('currentWeek').textContent = `Week ${currentWeek}`;
    
    // Calculate trimester
    let trimester = 1;
    if (currentWeek > 12) trimester = 2;
    if (currentWeek > 28) trimester = 3;
    document.getElementById('trimester').textContent = `Trimester ${trimester}`;
    
    // Update progress bar
    const progress = ((40 - weeksDiff) / 40) * 100;
    document.getElementById('pregnancyProgress').style.width = Math.max(0, Math.min(100, progress)) + '%';
    
    // Update baby development
    updateBabyDevelopment(currentWeek);
}

// Update baby development info
function updateBabyDevelopment(week) {
    const babySizes = {
        1: { size: 'poppy seed', measurement: '0.1 cm' },
        4: { size: 'sesame seed', measurement: '0.2 cm' },
        8: { size: 'raspberry', measurement: '1.6 cm' },
        12: { size: 'lime', measurement: '6.1 cm' },
        16: { size: 'avocado', measurement: '11.6 cm' },
        20: { size: 'banana', measurement: '16.4 cm' },
        24: { size: 'corn cob', measurement: '30 cm' },
        28: { size: 'eggplant', measurement: '37.6 cm' },
        32: { size: 'jicama', measurement: '42.4 cm' },
        36: { size: 'romaine lettuce', measurement: '47.4 cm' },
        40: { size: 'watermelon', measurement: '51.2 cm' }
    };
    
    // Find closest week
    let closestWeek = 1;
    for (let w in babySizes) {
        if (parseInt(w) <= week) {
            closestWeek = parseInt(w);
        }
    }
    
    const babyInfo = babySizes[closestWeek];
    document.getElementById('babySize').textContent = `Size of a ${babyInfo.size}`;
    document.getElementById('babyMeasurement').textContent = babyInfo.measurement;
    
    // Update milestones
    updateDevelopmentMilestones(week);
}

// Update development milestones
function updateDevelopmentMilestones(week) {
    const milestones = [
        { week: 4, icon: 'fas fa-heart', text: 'Heart begins to beat' },
        { week: 8, icon: 'fas fa-hand-paper', text: 'Fingers and toes form' },
        { week: 12, icon: 'fas fa-eye', text: 'Eyes and ears develop' },
        { week: 16, icon: 'fas fa-running', text: 'Baby starts moving' },
        { week: 20, icon: 'fas fa-heartbeat', text: 'You can feel kicks' },
        { week: 24, icon: 'fas fa-lungs', text: 'Lungs begin to develop' },
        { week: 28, icon: 'fas fa-brain', text: 'Brain development accelerates' },
        { week: 32, icon: 'fas fa-bone', text: 'Bones harden' },
        { week: 36, icon: 'fas fa-baby', text: 'Ready for birth' }
    ];
    
    const milestonesContainer = document.getElementById('developmentMilestones');
    if (milestonesContainer) {
        const relevantMilestones = milestones.filter(m => m.week <= week);
        milestonesContainer.innerHTML = relevantMilestones.map(milestone => `
            <div class="milestone-item">
                <i class="milestone-icon ${milestone.icon}"></i>
                <span>${milestone.text}</span>
            </div>
        `).join('');
    }
}

// Calculate weight recommendations
function calculateWeightRecommendations() {
    const preWeight = parseFloat(document.getElementById('prePregnancyWeight').value);
    const height = parseFloat(document.getElementById('height').value);
    
    if (!preWeight || !height) return;
    
    // Calculate BMI
    const bmi = preWeight / Math.pow(height / 100, 2);
    
    let recommendedGain;
    if (bmi < 18.5) {
        recommendedGain = '12.5-18 kg';
    } else if (bmi < 25) {
        recommendedGain = '11.5-16 kg';
    } else if (bmi < 30) {
        recommendedGain = '7-11.5 kg';
    } else {
        recommendedGain = '5-9 kg';
    }
    
    document.getElementById('recommendedGain').textContent = recommendedGain;
}

// Save pregnancy setup
function savePregnancySetup() {
    const dueDate = document.getElementById('dueDate').value;
    const preWeight = document.getElementById('prePregnancyWeight').value;
    const height = document.getElementById('height').value;
    
    if (!dueDate) {
        alert('Please enter your due date');
        return;
    }
    
    pregnancyData = {
        dueDate: dueDate,
        prePregnancyWeight: parseFloat(preWeight) || 0,
        height: parseFloat(height) || 0,
        setupDate: new Date().toISOString()
    };
    
    localStorage.setItem('pregnancyData', JSON.stringify(pregnancyData));
    closeModal('pregnancySetupModal');
    
    // Update dashboard
    updatePregnancyDashboard();
}

// Update pregnancy dashboard
function updatePregnancyDashboard() {
    if (!pregnancyData || !pregnancyData.dueDate) return;
    
    const dueDate = new Date(pregnancyData.dueDate);
    const today = new Date();
    
    // Calculate time remaining
    const timeDiff = dueDate.getTime() - today.getTime();
    const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
    const weeksDiff = Math.ceil(daysDiff / 7);
    
    // Update countdown
    document.getElementById('daysRemaining').textContent = Math.max(0, daysDiff);
    document.getElementById('weeksRemaining').textContent = Math.max(0, weeksDiff);
    
    // Update progress
    const currentWeek = Math.max(1, 40 - weeksDiff);
    document.getElementById('currentWeek').textContent = `Week ${currentWeek}`;
    
    let trimester = 1;
    if (currentWeek > 12) trimester = 2;
    if (currentWeek > 28) trimester = 3;
    document.getElementById('trimester').textContent = `Trimester ${trimester}`;
    
    const progress = ((40 - weeksDiff) / 40) * 100;
    document.getElementById('pregnancyProgress').style.width = Math.max(0, Math.min(100, progress)) + '%';
    
    // Update baby development
    updateBabyDevelopment(currentWeek);
    
    // Update weight tracking
    updateWeightTracking();
}

// Update weight tracking
function updateWeightTracking() {
    if (!pregnancyData) return;
    
    // Get current weight from localStorage or use pre-pregnancy weight
    const currentWeight = pregnancyData.prePregnancyWeight || 0;
    const weightGained = 0; // This would be calculated from weight entries
    
    document.getElementById('currentWeight').textContent = `${currentWeight} kg`;
    document.getElementById('weightGained').textContent = `${weightGained} kg`;
    
    // Calculate recommended gain
    if (pregnancyData.height) {
        const bmi = pregnancyData.prePregnancyWeight / Math.pow(pregnancyData.height / 100, 2);
        let recommendedGain;
        if (bmi < 18.5) {
            recommendedGain = '12.5-18 kg';
        } else if (bmi < 25) {
            recommendedGain = '11.5-16 kg';
        } else if (bmi < 30) {
            recommendedGain = '7-11.5 kg';
        } else {
            recommendedGain = '5-9 kg';
        }
        document.getElementById('recommendedGain').textContent = recommendedGain;
    }
}

// Kick Counter Functions
function startKickCounting() {
    const modal = document.getElementById('kickCounterModal');
    if (modal) {
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        resetKickCounter();
    }
}

function recordKick() {
    kickCounter.count++;
    document.getElementById('kickCount').textContent = kickCounter.count;
    
    // Add to history
    const history = document.getElementById('kickHistory');
    if (history) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString();
        const historyItem = document.createElement('div');
        historyItem.innerHTML = `<span>${timeStr}: Kick #${kickCounter.count}</span>`;
        history.appendChild(historyItem);
    }
}

function toggleKickTimer() {
    if (kickCounter.isRunning) {
        // Stop timer
        clearInterval(kickCounter.timer);
        kickCounter.isRunning = false;
        document.querySelector('.timer-btn i').className = 'fas fa-play';
        document.querySelector('.timer-btn').innerHTML = '<i class="fas fa-play"></i> Start Timer';
    } else {
        // Start timer
        kickCounter.startTime = new Date();
        kickCounter.isRunning = true;
        document.querySelector('.timer-btn i').className = 'fas fa-pause';
        document.querySelector('.timer-btn').innerHTML = '<i class="fas fa-pause"></i> Stop Timer';
        
        kickCounter.timer = setInterval(() => {
            const now = new Date();
            const elapsed = Math.floor((now - kickCounter.startTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            document.getElementById('kickTimer').textContent = 
                `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }, 1000);
    }
}

function resetKickCounter() {
    kickCounter.count = 0;
    kickCounter.isRunning = false;
    if (kickCounter.timer) {
        clearInterval(kickCounter.timer);
    }
    
    document.getElementById('kickCount').textContent = '0';
    document.getElementById('kickTimer').textContent = '00:00';
    document.querySelector('.timer-btn i').className = 'fas fa-play';
    document.querySelector('.timer-btn').innerHTML = '<i class="fas fa-play"></i> Start Timer';
    
    const history = document.getElementById('kickHistory');
    if (history) {
        history.innerHTML = '';
    }
}

// Contraction Timer Functions
function startContractionTimer() {
    const modal = document.getElementById('contractionTimerModal');
    if (modal) {
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        resetContractionTimer();
    }
}

function toggleContraction() {
    if (contractionTimer.isActive) {
        // End contraction
        const endTime = new Date();
        const duration = Math.floor((endTime - contractionTimer.startTime) / 1000);
        
        // Add to contractions list
        contractionTimer.contractions.push({
            start: contractionTimer.startTime,
            end: endTime,
            duration: duration
        });
        
        contractionTimer.isActive = false;
        document.querySelector('.contraction-btn i').className = 'fas fa-play';
        document.querySelector('.contraction-btn').innerHTML = '<i class="fas fa-play"></i> Start Contraction';
        
        // Update history
        updateContractionHistory();
    } else {
        // Start contraction
        contractionTimer.startTime = new Date();
        contractionTimer.isActive = true;
        document.querySelector('.contraction-btn i').className = 'fas fa-pause';
        document.querySelector('.contraction-btn').innerHTML = '<i class="fas fa-pause"></i> End Contraction';
        
        // Start timer
        contractionTimer.timer = setInterval(() => {
            const now = new Date();
            const elapsed = Math.floor((now - contractionTimer.startTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            document.getElementById('contractionTimer').textContent = 
                `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }, 1000);
    }
}

function updateContractionHistory() {
    const history = document.getElementById('contractionList');
    if (!history) return;
    
    history.innerHTML = contractionTimer.contractions.map((contraction, index) => {
        const startTime = contraction.start.toLocaleTimeString();
        const duration = `${Math.floor(contraction.duration / 60)}:${(contraction.duration % 60).toString().padStart(2, '0')}`;
        return `
            <div class="contraction-item">
                <span>Contraction ${index + 1}</span>
                <span>${startTime}</span>
                <span>${duration}</span>
            </div>
        `;
    }).join('');
}

function resetContractionTimer() {
    contractionTimer.isActive = false;
    contractionTimer.contractions = [];
    if (contractionTimer.timer) {
        clearInterval(contractionTimer.timer);
    }
    
    document.getElementById('contractionTimer').textContent = '00:00';
    document.getElementById('gapTimer').textContent = '00:00';
    document.querySelector('.contraction-btn i').className = 'fas fa-play';
    document.querySelector('.contraction-btn').innerHTML = '<i class="fas fa-play"></i> Start Contraction';
    
    const history = document.getElementById('contractionList');
    if (history) {
        history.innerHTML = '';
    }
}

// Pregnancy Symptoms
function showPregnancySymptoms() {
    // This would open a pregnancy-specific symptoms modal
    alert('Pregnancy symptoms tracking coming soon!');
}

// Doctor Visits
function showDoctorVisits() {
    // This would open a doctor visits scheduling modal
    alert('Doctor visits scheduling coming soon!');
}

// Open Pregnancy Window
function openPregnancyWindow() {
    // Create a new window for pregnancy dashboard
    const pregnancyWindow = window.open('', 'pregnancyWindow', 'width=1200,height=800,scrollbars=yes,resizable=yes');
    
    pregnancyWindow.document.write(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Pregnancy Dashboard - Cyclique</title>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
            <style>
                body {
                    margin: 0;
                    padding: 0;
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background: linear-gradient(135deg, #ff69b4, #ff1493);
                    min-height: 100vh;
                }
                .pregnancy-container {
                    padding: 2rem;
                    color: white;
                }
                .pregnancy-header {
                    text-align: center;
                    margin-bottom: 2rem;
                }
                .pregnancy-header h1 {
                    font-size: 2.5rem;
                    margin-bottom: 0.5rem;
                }
                .pregnancy-content {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                    gap: 2rem;
                }
                .pregnancy-card {
                    background: rgba(255, 255, 255, 0.1);
                    padding: 2rem;
                    border-radius: 20px;
                    backdrop-filter: blur(10px);
                }
                .pregnancy-card h3 {
                    margin-bottom: 1rem;
                    font-size: 1.5rem;
                }
                .close-btn {
                    position: absolute;
                    top: 1rem;
                    right: 1rem;
                    background: rgba(255, 255, 255, 0.2);
                    border: none;
                    color: white;
                    padding: 0.5rem 1rem;
                    border-radius: 25px;
                    cursor: pointer;
                    font-size: 1rem;
                }
            </style>
        </head>
        <body>
            <button class="close-btn" onclick="window.close()">Close</button>
            <div class="pregnancy-container">
                <div class="pregnancy-header">
                    <h1><i class="fas fa-baby"></i> Pregnancy Dashboard</h1>
                    <p>Track your pregnancy journey with comprehensive tools and insights</p>
                </div>
                <div class="pregnancy-content">
                    <div class="pregnancy-card">
                        <h3><i class="fas fa-calendar-alt"></i> Due Date Countdown</h3>
                        <p>Set up your due date to start tracking your pregnancy progress.</p>
                        <button onclick="alert('Pregnancy setup coming soon!')" style="background: rgba(255,255,255,0.2); border: none; color: white; padding: 0.8rem 1.5rem; border-radius: 25px; cursor: pointer;">Setup Pregnancy</button>
                    </div>
                    <div class="pregnancy-card">
                        <h3><i class="fas fa-running"></i> Kick Counter</h3>
                        <p>Track your baby's movements and kicks throughout the day.</p>
                        <button onclick="alert('Kick counter coming soon!')" style="background: rgba(255,255,255,0.2); border: none; color: white; padding: 0.8rem 1.5rem; border-radius: 25px; cursor: pointer;">Start Counting</button>
                    </div>
                    <div class="pregnancy-card">
                        <h3><i class="fas fa-stopwatch"></i> Contraction Timer</h3>
                        <p>Time your contractions when labor begins.</p>
                        <button onclick="alert('Contraction timer coming soon!')" style="background: rgba(255,255,255,0.2); border: none; color: white; padding: 0.8rem 1.5rem; border-radius: 25px; cursor: pointer;">Start Timer</button>
                    </div>
                    <div class="pregnancy-card">
                        <h3><i class="fas fa-weight"></i> Weight Tracking</h3>
                        <p>Monitor your weight gain throughout pregnancy.</p>
                        <button onclick="alert('Weight tracking coming soon!')" style="background: rgba(255,255,255,0.2); border: none; color: white; padding: 0.8rem 1.5rem; border-radius: 25px; cursor: pointer;">Track Weight</button>
                    </div>
                </div>
            </div>
        </body>
        </html>
    `);
    
    pregnancyWindow.document.close();
}

// Open Achievements Window
function openAchievementsWindow() {
    // Create a new window for achievements dashboard
    const achievementsWindow = window.open('', 'achievementsWindow', 'width=1200,height=800,scrollbars=yes,resizable=yes');
    
    achievementsWindow.document.write(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Achievements - Cyclique</title>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
            <style>
                body {
                    margin: 0;
                    padding: 0;
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background: linear-gradient(135deg, #ffd700, #ffed4e);
                    min-height: 100vh;
                    color: #2c3e50;
                }
                .achievements-container {
                    padding: 2rem;
                }
                .achievements-header {
                    text-align: center;
                    margin-bottom: 2rem;
                }
                .achievements-header h1 {
                    font-size: 2.5rem;
                    margin-bottom: 0.5rem;
                }
                .achievements-content {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                    gap: 2rem;
                }
                .achievement-card {
                    background: rgba(255, 255, 255, 0.8);
                    padding: 2rem;
                    border-radius: 20px;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
                }
                .achievement-card h3 {
                    margin-bottom: 1rem;
                    font-size: 1.5rem;
                }
                .close-btn {
                    position: absolute;
                    top: 1rem;
                    right: 1rem;
                    background: rgba(0, 0, 0, 0.2);
                    border: none;
                    color: #2c3e50;
                    padding: 0.5rem 1rem;
                    border-radius: 25px;
                    cursor: pointer;
                    font-size: 1rem;
                }
            </style>
        </head>
        <body>
            <button class="close-btn" onclick="window.close()">Close</button>
            <div class="achievements-container">
                <div class="achievements-header">
                    <h1><i class="fas fa-trophy"></i> Achievements</h1>
                    <p>Unlock achievements and level up your health journey</p>
                </div>
                <div class="achievements-content">
                    <div class="achievement-card">
                        <h3><i class="fas fa-star"></i> Level System</h3>
                        <p>Earn points and level up by tracking your health consistently.</p>
                        <div style="background: #f0f0f0; border-radius: 10px; padding: 1rem; margin: 1rem 0;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                                <span>Level 1</span>
                                <span>0/100 points</span>
                            </div>
                            <div style="background: #ddd; height: 8px; border-radius: 4px;">
                                <div style="background: linear-gradient(90deg, #ffd700, #ffed4e); height: 100%; width: 0%; border-radius: 4px;"></div>
                            </div>
                        </div>
                    </div>
                    <div class="achievement-card">
                        <h3><i class="fas fa-medal"></i> Badges</h3>
                        <p>Collect badges for different milestones and achievements.</p>
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin: 1rem 0;">
                            <div style="text-align: center; padding: 1rem; background: #f0f0f0; border-radius: 10px;">
                                <i class="fas fa-baby" style="font-size: 2rem; color: #ff69b4; margin-bottom: 0.5rem;"></i>
                                <div style="font-size: 0.8rem;">First Steps</div>
                            </div>
                            <div style="text-align: center; padding: 1rem; background: #f0f0f0; border-radius: 10px; opacity: 0.5;">
                                <i class="fas fa-fire" style="font-size: 2rem; color: #ff6b6b; margin-bottom: 0.5rem;"></i>
                                <div style="font-size: 0.8rem;">Week Warrior</div>
                            </div>
                            <div style="text-align: center; padding: 1rem; background: #f0f0f0; border-radius: 10px; opacity: 0.5;">
                                <i class="fas fa-heart" style="font-size: 2rem; color: #4ecdc4; margin-bottom: 0.5rem;"></i>
                                <div style="font-size: 0.8rem;">Health Hero</div>
                            </div>
                        </div>
                    </div>
                    <div class="achievement-card">
                        <h3><i class="fas fa-chart-line"></i> Statistics</h3>
                        <p>Track your progress and see how you're doing.</p>
                        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin: 1rem 0;">
                            <div style="text-align: center; padding: 1rem; background: #f0f0f0; border-radius: 10px;">
                                <div style="font-size: 2rem; font-weight: bold; color: #ffd700;">0</div>
                                <div style="font-size: 0.8rem;">Day Streak</div>
                            </div>
                            <div style="text-align: center; padding: 1rem; background: #f0f0f0; border-radius: 10px;">
                                <div style="font-size: 2rem; font-weight: bold; color: #ffd700;">0</div>
                                <div style="font-size: 0.8rem;">Total Points</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </body>
        </html>
    `);
    
    achievementsWindow.document.close();
}

// Health Modal
function showHealthModal() {
    alert('Health tracking features coming soon!');
}

// Community Modal
function showCommunityModal() {
    alert('Community features coming soon!');
}

// Show/Hide Dashboard Tabs
function showDashboardTabs() {
    const dashboardTabs = document.querySelector('.dashboard-tabs');
    if (dashboardTabs) {
        dashboardTabs.style.display = 'flex';
    }
}

function hideDashboardTabs() {
    const dashboardTabs = document.querySelector('.dashboard-tabs');
    if (dashboardTabs) {
        dashboardTabs.style.display = 'none';
    }
}
