document.addEventListener('DOMContentLoaded', function () {
    // Pie Chart (Departments Overview)
    var ctx1 = document.getElementById('pieChart').getContext('2d');
    var chartData1 = {
        labels: departmentNames,
        datasets: [{
            label: 'Number of Employees',
            backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF'],
            data: employeeCounts
        }]
    };
    new Chart(ctx1, {
        type: 'pie',
        data: chartData1,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Departments Overview'
                }
            }
        }
    });

    // Bar Chart (Overtime Tracking)
    var ctx2 = document.getElementById('barChart2').getContext('2d');

    // Filter out "Unknown" entry
    var filteredData = employeeNames
        .map((name, index) => ({
            name: name,
            hours: overtimeHours[index]
        }))
        .filter(item => item.name !== 'Unknown');

    var filteredNames = filteredData.map(item => item.name);
    var filteredHours = filteredData.map(item => item.hours);

    var chartData2 = {
        labels: filteredNames,
        datasets: [{
            label: 'Overtime Hours',
            backgroundColor: 'rgba(54, 162, 235, 5)', // Blue color with transparency
            borderColor: 'rgba(54, 162, 235, 1)', // Solid blue color
            data: filteredHours,
            barThickness: 60 // This makes the bars thinner
        }]
    };
    new Chart(ctx2, {
        type: 'bar',
        data: chartData2,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Overtime Hours'
                    },
                    ticks: {
                        stepSize: 1
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Employees'
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: 'Top Employees per Month'
                }
            }
        }
    });
});
