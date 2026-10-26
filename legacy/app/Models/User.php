<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Request;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var array<int, string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'email_verified_at' => 'datetime',
        'password' => 'hashed',
    ];

static public function getRecord(){ //for reterving employees data from database and search
// $return = self::select('users.*')
//           ->orderBy('id', 'desc')
//           ->paginate(5);

//           return $return;

$return = self::select('users.*');

// logic of the search box

       if(!empty(Request::get('id')))
       {
         $return = $return->where('id', '=', Request::get('id'));
       }


       if(!empty(Request::get('name')))
       {
         $return = $return->where('name', 'like', '%' .Request::get('name'). '%'); //notify the two dots .   .
       }

       if(!empty(Request::get('last_name')))
       {
         $return = $return->where('last_name', 'like', '%'  .Request::get('last_name'). '%');
       }

       if(!empty(Request::get('email')))
       {
         $return = $return->where('email', 'like', '%'  .Request::get('email'). '%');
       }

//end logic of search



    $return = $return->orderBy('id', 'desc')
              ->paginate(5);

  return $return;

}

// for the view buttons to convert it to name
// for job id to convert the id of job title in employee to the word
// this make after make job
public function get_job_single(){
    return $this->belongsTo(Job::class, "job_id");
}

public function get_manager_single(){
    return $this->belongsTo(Manager::class, "manager_id");
}

public function get_department_single(){
    return $this->belongsTo(Department::class, "department_id");
}




public function getAttendance($employee_id,$attendance_date)
{
    return Attendance::ChechAlreadyAttendance($employee_id,$attendance_date);
}


public function payrolls()
{
    return $this->hasMany(Payroll::class);
}

public function times()
{
    return $this->hasMany(Time::class, 'employee_id');
}

public function department()
{
    return $this->belongsTo(Department::class);
}


}
