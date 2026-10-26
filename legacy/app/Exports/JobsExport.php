<?php
namespace App\Exports;
use App\Models\Job;
use Maatwebsite\Excel\concerns\FromCollection;
use Maatwebsite\Excel\concerns\ShouldAutoSize;
use Maatwebsite\Excel\concerns\WithMapping;
use Maatwebsite\Excel\concerns\WithHeadings;
use Request;

class JobsExport implements FromCollection, ShouldAutoSize, WithMapping, WithHeadings{


public function collection(){
    $request = Request::all();
    return Job::getRecord($request);
}
protected $index = 0;
public function map($user):array{
    $cretedAtFormat = date('d-m-Y', strtotime($user->created_at));

return[ // data that will take in excel
    ++$this->index,
    $user->id,
    $user->job_title,
    $user->min_salary,
    $user->max_salary,
    $cretedAtFormat

];

}
public function headings():array{  //this is the names that will show in the head of excel sheet
return [
    'S. No',
    'ID',
    'Job Title',
    'Min Salary',
    'Max Salary',
    'Create At',



];
}

}

















