document.addEventListener('DOMContentLoaded', function () {
    var ctx = document.getElementById('barChart').getContext('2d');
    var chartData = {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
        datasets: [{
            label: 'Present Per Week',
            backgroundColor: 'rgba(75,192,192,5)', // Semi-transparent green
            borderColor: 'rgba(75,192,192,1)', // Solid green
            data: chartDataPresent // Use dynamic present data
        }, {
            label: 'Absent',
            backgroundColor: 'rgba(255,99,132,5)', // Semi-transparent red
            borderColor: 'rgba(255,99,132,1)', // Solid red
            data: chartDataAbsent // Use dynamic absent data
        }, {
            label: 'Vacations',
            backgroundColor: 'rgba(60,141,188,0.9)',
            borderColor: 'rgba(60,141,188,0.8)',
            data: chartDataVacations // Use dynamic vacation data
        }]
    };

    var options = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            y: {
                beginAtZero: true
            }
        }
    };

    new Chart(ctx, {
        type: 'bar',
        data: chartData,
        options: options
    });
});
