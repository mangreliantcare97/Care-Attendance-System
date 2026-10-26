document.addEventListener("DOMContentLoaded", function() {
    const toggleDarkMode = document.querySelector('.dark-mode-toggle'); // Select the specific toggle button

    toggleDarkMode.addEventListener('click', function() {
        // Toggle dark mode class on body
        document.body.classList.toggle('dark-mode');

        // Store the dark mode setting in localStorage
        if (document.body.classList.contains('dark-mode')) {
            localStorage.setItem('theme', 'dark');
        } else {
            localStorage.setItem('theme', 'light');
        }
    });

    // Apply the saved theme on page load
    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-mode');
    }
});
