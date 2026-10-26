<?php
namespace App\Exports;
use App\Models\History;
use App\Models\Payroll;
use Maatwebsite\Excel\concerns\FromCollection;
use Maatwebsite\Excel\concerns\ShouldAutoSize;
use Maatwebsite\Excel\concerns\WithMapping;
use Maatwebsite\Excel\concerns\WithHeadings;
use Request;

class PayrollExport implements FromCollection, ShouldAutoSize, WithMapping, WithHeadings{



public function collection(){
    $request = Request::all();
    return Payroll::getRecord();
}
protected $index = 0;
public function map($payroll): array
{
    $createdAtFormat = date('d-m-Y', strtotime($payroll->created_at));
    $month = date('F', strtotime($payroll->created_at)); // Get the month from the pay date

    return [
        $payroll->employee_id,
        $payroll->name,
        $payroll->basic_salary,
        $payroll->bounas,
        $payroll->deductions,
        $payroll->taxes,
        $payroll->rest_vacancy,
        $payroll->net_pay,
        $createdAtFormat, // Pay Date
        $month, // Add the Month column
    ];
}


public function headings():array{  //this is the names that will show in the head of excel sheet
return [
    'Employee ID',
    'Employee Name',
    'Basic Salary',
    'Bounas',
    'Deductions',
    'Taxes',
    'Vacation Balance',
    'Net Pay',
    'Pay Date',
    'Month',



];
}

}

















