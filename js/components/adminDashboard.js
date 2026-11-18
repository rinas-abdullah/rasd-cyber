// Admin Dashboard Component - Institutional analytics and management
// TODO: Add role-based access control when implementing authentication

import { API } from "../utils/api.js";

class AdminDashboard {
    constructor() {
        this.institutionReport = null;
        this.complianceReport = null;
        this.engagementMetrics = null;
        this.charts = {};

        this.init();
    }

    init() {
        // Non-admins are redirected by the page; don't fire institution
        // requests that can only return 403 and an error popup.
        const auth = window.authService;
        if (auth && typeof auth.isAdmin === "function" && !auth.isAdmin()) return;
        this.bindEvents();
        this.loadAnalytics();
    }

    bindEvents() {
        const refreshBtn = document.getElementById('refresh-report');
        const searchBtn = document.getElementById('search-user');
        const logoutBtn = document.getElementById('logout-btn');

        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.loadAnalytics());
        }

        if (searchBtn) {
            searchBtn.addEventListener('click', () => this.searchUser());
        }

        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.logout());
        }

        // Enter key for user search
        const userSearch = document.getElementById('user-search');
        if (userSearch) {
            userSearch.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.searchUser();
                }
            });
        }
    }

    async loadAnalytics() {
        try {
            // Load all analytics data in parallel
            const [institutionRes, complianceRes, engagementRes] = await Promise.all([
                API.get('/analytics/institution'),
                API.get('/analytics/compliance'),
                API.get('/analytics/engagement')
            ]);

            this.institutionReport = institutionRes.data;
            this.complianceReport = complianceRes.data;
            this.engagementMetrics = engagementRes.data;

            this.updateStatsCards();
            this.updateCharts();
            this.updateReports();

        } catch (error) {
            console.error('Failed to load analytics:', error);
            this.showError('Failed to load analytics data');
        }
    }

    updateStatsCards() {
        if (!this.institutionReport) return;

        const summary = this.institutionReport.summary;

        this.updateStatCard('total-users', summary.totalUsers);
        this.updateStatCard('active-users', summary.activeUsers);
        this.updateStatCard('completion-rate', `${summary.completionRate}%`);
        this.updateStatCard('avg-score', summary.averageScore);
    }

    updateStatCard(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = value;
        }
        const heroMirror = {
            'total-users': 'hero-total-users',
            'active-users': 'hero-active-users',
            'completion-rate': 'hero-completion-rate',
            'avg-score': 'hero-avg-score',
        };
        const heroId = heroMirror[elementId];
        if (heroId) {
            const heroEl = document.getElementById(heroId);
            if (heroEl) heroEl.textContent = value;
        }
    }

    updateCharts() {
        this.createRoleChart();
        this.createCompletionChart();
    }

    createRoleChart() {
        const ctx = document.getElementById('roleChart');
        if (!ctx || !this.institutionReport) return;

        const roleData = this.institutionReport.userBreakdown;

        if (this.charts.roleChart) {
            this.charts.roleChart.destroy();
        }

        this.charts.roleChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Students', 'Instructors', 'Admins'],
                datasets: [{
                    data: [roleData.students, roleData.instructors, roleData.admins],
                    backgroundColor: [
                        '#7ed9a6',
                        '#f3a05e',
                        '#f3a05e'
                    ],
                    borderColor: 'rgba(7, 29, 28, 0.9)',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#f3a05e',
                            padding: 14,
                            font: { size: 11, weight: '600' }
                        }
                    }
                }
            }
        });
    }

    createCompletionChart() {
        const ctx = document.getElementById('completionChart');
        if (!ctx || !this.institutionReport) return;

        const courseData = this.institutionReport.courseAnalytics;

        if (this.charts.completionChart) {
            this.charts.completionChart.destroy();
        }

        this.charts.completionChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: courseData.map(course => course.title.substring(0, 20) + '...'),
                datasets: [{
                    label: 'Completion Rate (%)',
                    data: courseData.map(course =>
                        Math.round((course.completedUsers / course.enrolledUsers) * 100) || 0
                    ),
                    backgroundColor: 'rgba(126, 217, 166, 0.55)',
                    borderColor: '#7ed9a6',
                    borderWidth: 1,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                scales: {
                    x: {
                        ticks: { color: '#f3a05e', maxRotation: 45, minRotation: 0 },
                        grid: { color: 'rgba(243, 160, 94, 0.06)' }
                    },
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: { color: '#f3a05e' },
                        grid: { color: 'rgba(243, 160, 94, 0.08)' }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    }

    updateReports() {
        this.updateInstitutionReport();
        this.updateTopPerformers();
        this.updateComplianceReport();
    }

    updateInstitutionReport() {
        const container = document.getElementById('institution-report');
        if (!container || !this.institutionReport) return;

        const report = this.institutionReport;
        const summary = report.summary;

        container.innerHTML = `
            <div class="report-summary">
                <p><strong>Institution:</strong> ${report.institution}</p>
                <p><strong>Generated:</strong> ${new Date(report.generatedAt).toLocaleString()}</p>
                <p><strong>Total Courses:</strong> ${summary.totalCourses}</p>
                <p><strong>Active Users:</strong> ${summary.activeUsers}/${summary.totalUsers}</p>
                <p><strong>Overall Completion Rate:</strong> ${summary.completionRate}%</p>
                <p><strong>Average Score:</strong> ${summary.averageScore}</p>
            </div>
        `;
    }

    updateTopPerformers() {
        const container = document.getElementById('top-performers');
        if (!container || !this.institutionReport) return;

        const topPerformers = this.institutionReport.topPerformers;

        if (topPerformers.length === 0) {
            container.innerHTML = '<p>No user data available</p>';
            return;
        }

        const html = topPerformers.map((user, index) => `
            <div class="performer-item">
                <span class="rank">#${index + 1}</span>
                <span class="username">${user.username}</span>
                <span class="role">${user.role}</span>
                <span class="score">${user.score} pts</span>
                <span class="level">Level ${user.level}</span>
            </div>
        `).join('');

        container.innerHTML = `<div class="performers-list">${html}</div>`;
    }

    updateComplianceReport() {
        const container = document.getElementById('compliance-report');
        if (!container || !this.complianceReport) return;

        const compliance = this.complianceReport.compliance;

        container.innerHTML = `
            <div class="compliance-summary">
                <p><strong>Active Users:</strong> ${compliance.activeUsers}/${compliance.totalUsers}</p>
                <p><strong>Inactive Users:</strong> ${compliance.inactiveUsers}</p>
                <p><strong>Users with Progress:</strong> ${compliance.usersWithProgress}</p>
                <p><strong>Average Engagement:</strong> ${compliance.averageEngagement} scenarios</p>
            </div>
        `;
    }

    async searchUser() {
        const searchInput = document.getElementById('user-search');
        const userDetails = document.getElementById('user-details');
        const reportContent = document.getElementById('user-report-content');

        if (!searchInput || !userDetails || !reportContent) return;

        const username = searchInput.value.trim();
        if (!username) {
            this.showError('Please enter a username');
            return;
        }

        try {
            const response = await API.get(`/analytics/user/${username}`);
            const userReport = response.data;

            reportContent.innerHTML = this.formatUserReport(userReport);
            userDetails.style.display = 'block';
            userDetails.classList.remove('hidden');

        } catch (error) {
            console.error('Failed to load user report:', error);
            this.showError('User not found or failed to load report');
            userDetails.style.display = 'none';
            userDetails.classList.add('hidden');
        }
    }

    formatUserReport(report) {
        return `
            <div class="user-report">
                <div class="user-header">
                    <h4>${report.username}</h4>
                    <span class="user-role role-${report.role}">${report.role}</span>
                    <span class="user-institution">${report.institution}</span>
                </div>

                <div class="user-stats">
                    <div class="stat-item">
                        <span class="stat-label">Level:</span>
                        <span class="stat-value">${report.currentStats.level}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Total Score:</span>
                        <span class="stat-value">${report.currentStats.totalScore}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Current Streak:</span>
                        <span class="stat-value">${report.currentStats.currentStreak}</span>
                    </div>
                </div>

                <div class="user-progress">
                    <h5>Progress Overview</h5>
                    <p>Completed Scenarios: ${report.progress.completedScenarios.length}</p>
                    <p>Current Scenario: ${report.progress.currentScenario || 'None'}</p>
                    <p>Adaptive Difficulty: ${report.progress.adaptiveDifficulty}</p>
                </div>

                ${report.recommendations.length > 0 ? `
                    <div class="user-recommendations">
                        <h5>Recommended Courses</h5>
                        <ul>
                            ${report.recommendations.map(course => `<li>${course.title}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
            </div>
        `;
    }

    logout() {
        // Clear any stored session data
        localStorage.removeItem('cybermind_user');
        sessionStorage.removeItem('cybermind_session');

        // Redirect to login/dashboard
        window.location.href = '../index.html';
    }

    showError(message) {
        // Simple error display - could be enhanced with a toast system
        alert(message);
    }
}

// Initialize admin dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new AdminDashboard();
});