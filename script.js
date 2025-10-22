// User data storage (in a real app, this would be handled by a backend)
let users = JSON.parse(localStorage.getItem('periodTrackerUsers')) || [];
let currentUser = null;
let periodData = JSON.parse(localStorage.getItem('periodData')) || [];
let dailyLogs = JSON.parse(localStorage.getItem('dailyLogs')) || [];

// DOM Elements
const loginModal = document.getElementById('loginModal');
const signupModal = document.getElementById('signupModal');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const successMessage = document.getElementById('successMessage');
const errorMessage = document.getElementById('errorMessage');
const successText = document.getElementById('successText');
const errorText = document.getElementById('errorText');

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
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
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

function authenticateUser(email, password) {
    const user = users.find(user => user.email === email && user.password === password);
    if (!user) {
        throw new Error('Invalid email or password');
    }
    if (!user.isActive) {
        throw new Error('Account is deactivated');
    }
    return user;
}

// Login Form Handler
loginForm.addEventListener('submit', function(e) {
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

    // Simulate API call delay
    setTimeout(() => {
        try {
            console.log('Attempting to authenticate user...'); // Debug log
            console.log('Available users:', users); // Debug log
            const user = authenticateUser(email, password);
            console.log('User authenticated:', user); // Debug log
            
            // Store user session
            currentUser = user;
            if (rememberMe) {
                localStorage.setItem('currentUser', JSON.stringify(user));
            } else {
                sessionStorage.setItem('currentUser', JSON.stringify(user));
            }

            showSuccess(`Welcome back, ${user.name}!`);
            closeModal('loginModal');
            
            // Reset form
            loginForm.reset();
            
            // Show dashboard
            showDashboard();

        } catch (error) {
            console.error('Login error:', error); // Debug log
            showError(error.message);
        } finally {
            // Reset button
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    }, 1500);
});

// Signup Form Handler
signupForm.addEventListener('submit', function(e) {
    e.preventDefault();
    
    const name = document.getElementById('signupName').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const age = parseInt(document.getElementById('age').value);
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

// Real-time password confirmation validation
document.getElementById('confirmPassword').addEventListener('input', function() {
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = this.value;
    
    if (confirmPassword && password !== confirmPassword) {
        this.style.borderColor = '#f44336';
    } else {
        this.style.borderColor = '#e0e0e0';
    }
});

// Real-time email validation
document.getElementById('signupEmail').addEventListener('blur', function() {
    const email = this.value.trim();
    if (email && !validateEmail(email)) {
        this.style.borderColor = '#f44336';
    } else {
        this.style.borderColor = '#e0e0e0';
    }
});

document.getElementById('loginEmail').addEventListener('blur', function() {
    const email = this.value.trim();
    if (email && !validateEmail(email)) {
        this.style.borderColor = '#f44336';
    } else {
        this.style.borderColor = '#e0e0e0';
    }
});

// Real-time password strength indicator
document.getElementById('signupPassword').addEventListener('input', function() {
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
    document.getElementById('dashboard').style.display = 'block';
    document.querySelector('.hero').style.display = 'none';
    document.querySelector('.features').style.display = 'none';
    document.querySelector('.navbar').style.display = 'none';
    
    // Update user info
    document.getElementById('userDisplayName').textContent = currentUser.name;
    document.getElementById('userName').textContent = `Welcome back, ${currentUser.name}!`;
    
    // Initialize dashboard
    initializeDashboard();
}

function hideDashboard() {
    document.getElementById('dashboard').style.display = 'none';
    document.querySelector('.hero').style.display = 'block';
    document.querySelector('.features').style.display = 'block';
    document.querySelector('.navbar').style.display = 'block';
}

function logout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    sessionStorage.removeItem('currentUser');
    hideDashboard();
    showSuccess('Logged out successfully!');
}

function initializeDashboard() {
    updateQuickStats();
    generateCalendar();
    updateInsights();
    updateHistoryStats();
    loadTodayLog();
}

// Period Tracking Functions
function addPeriod(startDate, endDate, flow, notes = '') {
    const period = {
        id: Date.now().toString(),
        userId: currentUser.id,
        startDate: startDate,
        endDate: endDate,
        flow: flow,
        notes: notes,
        createdAt: new Date().toISOString()
    };
    
    periodData.push(period);
    localStorage.setItem('periodData', JSON.stringify(periodData));
    
    // Update dashboard
    updateQuickStats();
    generateCalendar();
    updateInsights();
    updateHistoryStats();
}

function getUserPeriods() {
    return periodData.filter(period => period.userId === currentUser.id);
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
    if (periods.length === 0) return null;
    
    const lastPeriod = periods[periods.length - 1];
    const avgCycleLength = calculateCycleLength(periods);
    const lastStartDate = new Date(lastPeriod.startDate);
    const nextStartDate = new Date(lastStartDate);
    nextStartDate.setDate(lastStartDate.getDate() + avgCycleLength);
    
    return nextStartDate;
}

function updateQuickStats() {
    const periods = getUserPeriods();
    const today = new Date();
    
    if (periods.length > 0) {
        const lastPeriod = periods[periods.length - 1];
        const lastStartDate = new Date(lastPeriod.startDate);
        const daysSince = Math.floor((today - lastStartDate) / (1000 * 60 * 60 * 24));
        
        document.getElementById('daysSinceLastPeriod').textContent = daysSince;
        
        const nextPeriod = predictNextPeriod(periods);
        if (nextPeriod) {
            const daysUntil = Math.ceil((nextPeriod - today) / (1000 * 60 * 60 * 24));
            document.getElementById('nextPeriodDays').textContent = daysUntil;
        }
        
        const avgCycleLength = calculateCycleLength(periods);
        document.getElementById('cycleLength').textContent = avgCycleLength;
    } else {
        document.getElementById('daysSinceLastPeriod').textContent = '--';
        document.getElementById('nextPeriodDays').textContent = '--';
        document.getElementById('cycleLength').textContent = '28';
    }
}

// Calendar Functions
let currentCalendarDate = new Date();

function generateCalendar() {
    const calendarGrid = document.getElementById('calendarGrid');
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    
    document.getElementById('currentMonth').textContent = 
        `${monthNames[currentCalendarDate.getMonth()]} ${currentCalendarDate.getFullYear()}`;
    
    const firstDay = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth(), 1);
    const lastDay = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());
    
    calendarGrid.innerHTML = '';
    
    // Add day headers
    const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayHeaders.forEach(day => {
        const dayHeader = document.createElement('div');
        dayHeader.className = 'calendar-day day-header';
        dayHeader.textContent = day;
        calendarGrid.appendChild(dayHeader);
    });
    
    // Generate calendar days
    for (let i = 0; i < 42; i++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);
        
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';
        dayElement.textContent = date.getDate();
        
        // Check if this is today
        const today = new Date();
        if (date.toDateString() === today.toDateString()) {
            dayElement.classList.add('today');
        }
        
        // Check if this is a period day
        const periods = getUserPeriods();
        periods.forEach(period => {
            const startDate = new Date(period.startDate);
            const endDate = new Date(period.endDate);
            if (date >= startDate && date <= endDate) {
                dayElement.classList.add('period');
            }
        });
        
        // Check if this is predicted period day
        const nextPeriod = predictNextPeriod(periods);
        if (nextPeriod && date.toDateString() === nextPeriod.toDateString()) {
            dayElement.classList.add('predicted');
        }
        
        calendarGrid.appendChild(dayElement);
    }
}

function previousMonth() {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
    generateCalendar();
}

function nextMonth() {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
    generateCalendar();
}

// Add Period Modal
function showAddPeriodModal() {
    document.getElementById('addPeriodModal').style.display = 'block';
    document.body.style.overflow = 'hidden';
}

// Add Period Form Handler
document.getElementById('addPeriodForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const startDate = document.getElementById('periodStartDate').value;
    const endDate = document.getElementById('periodEndDate').value;
    const flow = document.getElementById('periodFlow').value;
    const notes = document.getElementById('periodNotes').value;
    
    if (new Date(startDate) > new Date(endDate)) {
        showError('End date must be after start date');
        return;
    }
    
    addPeriod(startDate, endDate, flow, notes);
    closeModal('addPeriodModal');
    showSuccess('Period added successfully!');
    
    // Reset form
    this.reset();
});

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
function updateInsights() {
    const periods = getUserPeriods();
    
    if (periods.length > 0) {
        const nextPeriod = predictNextPeriod(periods);
        const avgCycleLength = calculateCycleLength(periods);
        
        if (nextPeriod) {
            document.getElementById('predictedDate').textContent = 
                nextPeriod.toLocaleDateString();
        }
        
        document.getElementById('avgCycleLength').textContent = avgCycleLength;
        
        // Determine cycle pattern
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
        
        document.getElementById('cyclePattern').textContent = pattern;
        
        // Health tips based on cycle phase
        const today = new Date();
        const lastPeriod = periods[periods.length - 1];
        const daysSince = Math.floor((today - new Date(lastPeriod.startDate)) / (1000 * 60 * 60 * 24));
        
        let healthTip = 'Stay hydrated and maintain a balanced diet for optimal health.';
        if (daysSince <= 5) {
            healthTip = 'During your period: Stay hydrated, eat iron-rich foods, and consider light exercise to help with cramps.';
        } else if (daysSince >= 10 && daysSince <= 16) {
            healthTip = 'Ovulation phase: You may experience increased energy. Great time for exercise and social activities.';
        } else if (daysSince >= 20) {
            healthTip = 'Pre-menstrual phase: Consider reducing caffeine and increasing magnesium-rich foods.';
        }
        
        document.getElementById('healthTips').textContent = healthTip;
    }
}

// History Stats Functions
function updateHistoryStats() {
    const periods = getUserPeriods();
    
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
        
        document.getElementById('shortestCycle').textContent = `${shortest} days`;
        document.getElementById('longestCycle').textContent = `${longest} days`;
        
        let regularity = 'Regular';
        if (variance <= 2) regularity = 'Very Regular';
        else if (variance <= 7) regularity = 'Regular';
        else if (variance <= 14) regularity = 'Somewhat Irregular';
        else regularity = 'Irregular';
        
        document.getElementById('regularity').textContent = regularity;
    } else {
        document.getElementById('shortestCycle').textContent = '-- days';
        document.getElementById('longestCycle').textContent = '-- days';
        document.getElementById('regularity').textContent = '--';
    }
}

// Check if user is already logged in on page load
window.addEventListener('load', function() {
    const savedUser = localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        showDashboard();
    }
});
