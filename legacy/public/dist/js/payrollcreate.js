document.addEventListener('DOMContentLoaded', function() {
    const selectAllCheckbox = document.getElementById('select-all');
    const employeeCheckboxes = document.querySelectorAll('.employee-checkbox');

    selectAllCheckbox.addEventListener('change', function() {
        employeeCheckboxes.forEach(checkbox => {
            checkbox.checked = selectAllCheckbox.checked;
        });
    });
});
