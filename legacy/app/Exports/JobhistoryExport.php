<?php
namespace App\Exports;
use App\Models\History;
use Maatwebsite\Excel\concerns\FromCollection;
use Maatwebsite\Excel\concerns\ShouldAutoSize;
use Maatwebsite\Excel\concerns\WithMapping;
use Maatwebsite\Excel\concerns\WithHeadings;
use Request;

class JobhistoryExport implements FromCollection, ShouldAutoSize, WithMapping, WithHeadings{

public function collection(){
    $request = Request::all();
    return History::getRecord($request);
}
protected $index = 0;
public function map($history):array{
    $cretedAtFormat = date('d-m-Y', strtotime($history->created_at));

return[ // data that will take in excel
    ++$this->index,
    $history->id,
    $history->employee_name,
    $history->start_date,
    $history->end_date,
    $history->job_title,
    $history->department_name,
    $cretedAtFormat

];

}
public function headings():array{  //this is the names that will show in the head of excel sheet
return [
    'S. No',
    'ID',
    'Employee Name',
    'Start Date',
    'End Date',
    'Job Name',
    'Department Name',
    'Create At',



];
}

}

















