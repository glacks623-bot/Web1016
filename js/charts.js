/**
 * charts.js
 * Chart.js visualizations for Category Budget (Doughnut) and Department Budget (Horizontal Bar)
 */

const ChartsManager = {
  doughnutChart: null,
  barChart: null,

  colors: [
    '#3B82F6', // Blue
    '#10B981', // Emerald
    '#F59E0B', // Amber
    '#EC4899', // Pink
    '#8B5CF6', // Purple
    '#06B6D4', // Cyan
    '#6366F1', // Indigo
    '#14B8A6'  // Teal
  ],

  init() {
    this.createCategoryDoughnut();
    this.createDepartmentBar();
  },

  createCategoryDoughnut() {
    const ctx = document.getElementById('categoryDoughnutChart');
    if (!ctx) return;

    this.doughnutChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: [],
        datasets: [{
          data: [],
          backgroundColor: this.colors,
          borderWidth: 2,
          borderColor: '#ffffff',
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 12,
              padding: 14,
              font: { family: "'Pretendard', sans-serif", size: 12 }
            }
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const label = context.label || '';
                const value = context.parsed || 0;
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const percent = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                const eok = (value / 100).toFixed(1);
                return ` ${label}: ${value.toLocaleString()} 백만원 (${eok}억원, ${percent}%)`;
              }
            }
          }
        },
        cutout: '68%'
      }
    });
  },

  createDepartmentBar() {
    const ctx = document.getElementById('departmentBarChart');
    if (!ctx) return;

    this.barChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [
          {
            label: '시비',
            data: [],
            backgroundColor: '#3B82F6',
            borderRadius: 4
          },
          {
            label: '국비',
            data: [],
            backgroundColor: '#10B981',
            borderRadius: 4
          },
          {
            label: '기타/민자',
            data: [],
            backgroundColor: '#94A3B8',
            borderRadius: 4
          }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            stacked: true,
            grid: { color: '#F1F5F9' },
            ticks: {
              font: { size: 11 },
              callback: (val) => val.toLocaleString()
            }
          },
          y: {
            stacked: true,
            grid: { display: false },
            ticks: {
              font: { family: "'Pretendard', sans-serif", size: 12 }
            }
          }
        },
        plugins: {
          legend: {
            position: 'top',
            align: 'end',
            labels: {
              boxWidth: 12,
              font: { size: 11 }
            }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.x.toLocaleString()} 백만원`
            }
          }
        }
      }
    });
  },

  /**
   * Update charts when filteredData changes
   */
  update(filteredData) {
    if (!filteredData || filteredData.length === 0) {
      if (this.doughnutChart) {
        this.doughnutChart.data.labels = ['데이터 없음'];
        this.doughnutChart.data.datasets[0].data = [0];
        this.doughnutChart.update();
      }
      if (this.barChart) {
        this.barChart.data.labels = [];
        this.barChart.data.datasets.forEach(d => d.data = []);
        this.barChart.update();
      }
      return;
    }

    // 1. Group by Category Large
    const catMap = {};
    filteredData.forEach(d => {
      const cat = d.catLarge || '기타';
      catMap[cat] = (catMap[cat] || 0) + d.totalBudget;
    });

    const catLabels = Object.keys(catMap).sort((a, b) => catMap[b] - catMap[a]);
    const catValues = catLabels.map(l => Math.round(catMap[l] * 10) / 10);

    if (this.doughnutChart) {
      this.doughnutChart.data.labels = catLabels;
      this.doughnutChart.data.datasets[0].data = catValues;
      this.doughnutChart.update();
    }

    // 2. Group by Department (Top 8 departments)
    const deptMap = {};
    filteredData.forEach(d => {
      const dept = d.dept || d.agencyDept || '미지정';
      if (!deptMap[dept]) {
        deptMap[dept] = { city: 0, national: 0, other: 0, total: 0 };
      }
      deptMap[dept].city += d.cityBudget;
      deptMap[dept].national += d.nationalBudget;
      deptMap[dept].other += d.otherBudget;
      deptMap[dept].total += d.totalBudget;
    });

    const sortedDepts = Object.keys(deptMap)
      .sort((a, b) => deptMap[b].total - deptMap[a].total)
      .slice(0, 8); // Top 8

    if (this.barChart) {
      this.barChart.data.labels = sortedDepts;
      this.barChart.data.datasets[0].data = sortedDepts.map(d => Math.round(deptMap[d].city * 10) / 10);
      this.barChart.data.datasets[1].data = sortedDepts.map(d => Math.round(deptMap[d].national * 10) / 10);
      this.barChart.data.datasets[2].data = sortedDepts.map(d => Math.round(deptMap[d].other * 10) / 10);
      this.barChart.update();
    }
  }
};
