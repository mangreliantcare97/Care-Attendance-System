<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Request;

class Attendance extends Model
{
    use HasFactory;

    protected $table = 'attendances';

    public function user()
    {
        return $this->belongsTo(User::class);
    }




    static public function getRecord()
    {

    $return = self::select('attendances.*', 'employee.name as employee_name')
            ->join('users as employee', 'employee.id', '=', 'attendances.employee_id')
            ->orderBy('id', 'desc');

            // if(!empty(Request::get('employee_id')))
            // {
            //     $return = $return->where('attendances.employee_id', 'like', '%'  .Request::get('employee_id'). '%');
            // }

            if(!empty(Request::get('employee_name')))
            {
                $return = $return->where('employee.name', 'like', '%'  .Request::get('employee_name'). '%');
            }


            if(!empty(Request::get('attendance_date')))
            {
                $return = $return->where('attendance_date', 'like', '%'  .Request::get('attendance_date'). '%');
            }

            if(!empty(Request::get('attendance_type')))
            {
                $return = $return->where('attendance_type', 'like', '%'  .Request::get('attendance_type'). '%');
            }



            if(!empty(Request::get('start_date')))
            {
                if(empty(Request::get('end_date')))
                {
                    // If only start_date is provided, search for this specific date
                    $return = $return->whereDate('attendances.attendance_date', Request::get('start_date'));
                }
                else
                {
                    // If both start_date and end_date are provided, use date range
                    $return = $return->whereDate('attendances.attendance_date', '>=', Request::get('start_date'))
                                     ->whereDate('attendances.attendance_date', '<=', Request::get('end_date'));
                }
            }


            // $return = $return->paginate(8);
    return $return->get();

    }





static public function ChechAlreadyAttendance($employee_id, $attendance_date){

return Attendance::where('employee_id', '=',$employee_id)->where('attendance_date', '=',$attendance_date)->first();
}

}
