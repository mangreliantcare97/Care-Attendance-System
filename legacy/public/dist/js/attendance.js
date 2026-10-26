document.addEventListener('DOMContentLoaded', function() {
    const saveAttendanceInputs = document.querySelectorAll('.SaveAttendance');
    const attendanceDateInput = document.getElementById('getAttendanceDate');

    saveAttendanceInputs.forEach(input => {
        input.addEventListener('change', saveAttendance);
    });

    function saveAttendance(event) {
        const employeeId = event.target.id;
        const attendanceType = event.target.value;
        const attendanceDate = attendanceDateInput.value;

        fetch('/admin/attendance/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content')
            },
            body: JSON.stringify({
                employee_id: employeeId,
                attendance_type: attendanceType,
                attendance_date: attendanceDate
            })
        })
        .then(response => response.json())
        .then(data => {
            alert(data.message);
        })
        .catch(error => {
            console.error('Error:', error);
            alert('An error occurred while saving attendance.');
        });
    }
});
