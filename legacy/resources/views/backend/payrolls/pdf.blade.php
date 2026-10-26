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
    <h2>Payroll Report</h2>


    <table class="table table-bordered">
        <thead>
        <tr>
            <th>Employee ID</th>
            <th>Employee Name</th>
            <th>Basic Salary</th>
            <th>Bonuses</th>
            <th>Deductions</th>
            <th>Taxes</th>
            <th>Vacation Balance</th>
            <th>Net Pay</th>
            <th>Pay Date</th>
            <th>Month</th>
        </tr>
    </thead>
    <tbody>
        @foreach($getRecord as $value)
        <tr>
            <td>{{ $value->employee_id }}</td>
            <td>{{ $value->name }}</td>
            <td>{{ $value->basic_salary }}</td>
            <td>{{ $value->bounas }}</td>
            <td>{{ $value->deductions }}</td>
            <td>{{ $value->taxes }}</td>
            <td> Balance = {{ $value->rest_vacancy }} day</td>
            <td>{{ $value->net_pay }}</td>
            <td>{{ date('d-m-Y (h:i A)', strtotime($value->created_at)) }}</td>
            <td>{{ date('m', strtotime($value->created_at)) }}</td>


        </tr>
        @endforeach
    </tbody>
</table>









    <br>
    <h2> Signature: ________ </h2>
</body>
</html>
