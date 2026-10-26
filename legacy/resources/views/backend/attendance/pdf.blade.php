<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Attendance Report</title>
    <style>
        /* Include only the necessary styles */
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th, td {
            padding: 8px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }
        th {
            background-color: #f2f2f2;
        }
    </style>
</head>
<body>
    <h1 style="text-align: center"> ABC Company </h1>
    <h2>Attendance Report</h2>

    <table>
        <thead>
            <tr>
                <th>Employee ID</th>
                <th>Employee Name</th>
                <th>Attendance</th>
                <th>Attendance Date</th>
                <th>Created Date</th>
            </tr>
        </thead>
        <tbody>
            @forelse ($getRecord as $value)
            <tr>
                <td>{{ $value->employee_id }}</td>
                <td>{{ $value->employee_name }}</td>
                <td>
                    @if ($value->attendance_type == 1)
                        Present
                    @elseif($value->attendance_type == 2)
                        Late
                    @elseif($value->attendance_type == 3)
                        Absent
                    @elseif($value->attendance_type == 4)
                        Half Day
                    @endif
                </td>
                <td>{{ date('d-m-Y', strtotime($value->attendance_date)) }}</td>
                <td>{{ date('d-m-Y (h:i A)', strtotime($value->created_at)) }}</td>
            </tr>
            @empty
            <tr>
                <td colspan="5">Record not Found</td>
            </tr>
            @endforelse
        </tbody>
    </table>








    <br>
    <h2> Signature: ________ </h2>
</body>
</html>
