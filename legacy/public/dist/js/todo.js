document.addEventListener('DOMContentLoaded', () => {
    const taskCheckboxes = document.querySelectorAll('.taskCheckbox');
    const selectAllCheckbox = document.getElementById('selectAll');

    // Load saved selections from localStorage
    taskCheckboxes.forEach(checkbox => {
        const taskId = checkbox.value;
        checkbox.checked = localStorage.getItem(`task_${taskId}`) === 'true';

        checkbox.addEventListener('change', () => {
            localStorage.setItem(`task_${taskId}`, checkbox.checked);
        });
    });

    selectAllCheckbox.addEventListener('click', toggleSelectAll);
});

function toggleSelectAll() {
    const selectAllCheckbox = document.getElementById('selectAll');
    const taskCheckboxes = document.querySelectorAll('.taskCheckbox');
    taskCheckboxes.forEach(checkbox => {
        checkbox.checked = selectAllCheckbox.checked;
        localStorage.setItem(`task_${checkbox.value}`, selectAllCheckbox.checked);
    });
}

function editTask(taskId) {
    const textElement = document.getElementById(`taskText${taskId}`);
    const editInput = document.getElementById(`editInput${taskId}`);
    const form = document.getElementById(`editForm${taskId}`);

    if (editInput.style.display === "none") {
        editInput.style.display = "inline";
        textElement.style.display = "none";
        editInput.focus();
    } else {
        editInput.style.display = "none";
        textElement.style.display = "inline";
        form.submit();
    }
}

function deleteSelected() {
    const taskCheckboxes = document.querySelectorAll('.taskCheckbox:checked');
    const taskIds = Array.from(taskCheckboxes).map(checkbox => checkbox.value);

    if (taskIds.length > 0) {
        const confirmation = confirm('Are you sure you want to delete the selected tasks?');
        if (confirmation) {
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = '/admin/do'; // Update this URL

            const csrfInput = document.createElement('input');
            csrfInput.type = 'hidden';
            csrfInput.name = '_token';
            csrfInput.value = document.querySelector('meta[name="csrf-token"]').getAttribute('content');
            form.appendChild(csrfInput);

            const methodInput = document.createElement('input');
            methodInput.type = 'hidden';
            methodInput.name = '_method';
            methodInput.value = 'DELETE';
            form.appendChild(methodInput);

            taskIds.forEach(id => {
                const input = document.createElement('input');
                input.type = 'hidden';
                input.name = 'task_ids[]';
                input.value = id;
                form.appendChild(input);
            });

            document.body.appendChild(form);
            form.submit();
        }
    } else {
        alert('No tasks selected for delete.');
    }
}

