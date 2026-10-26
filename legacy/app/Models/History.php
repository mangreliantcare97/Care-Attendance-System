<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Request;

class History extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
   // protected $table = 'histories'; //34an lo hnak esm elgdwal mo5tlf
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

static public function getRecord($request){ //for reterving jobhistories data from database for search action
// $return = self::select('jobhistories.*')
//           ->orderBy('id', 'desc')
//           ->paginate(5);

//           return $return;

$return = self::select('histories.*','jobs.job_title','departments.department_name') //bktp esm elgdwal.el7aga al 3ayzha mno

->join('jobs','jobs.id', '=', 'histories.job_id')// awl gdwal ol primary bta3o , = , tany gadwal oforen algadwal alh7ot feh

->join('departments','departments.id', '=', 'histories.department_id')

// b3dha ro7 hnak list astd3eh k2nk wa2f f gdwalo bzbt

->orderBy('id', 'desc');








// logic of the search box



       if(!empty(Request::get('employee_name')))
       {
         $return = $return->where('employee_name', 'like', '%'  .Request::get('employee_name'). '%');
       }




       if(!empty(Request::get('job_title')))
       {
         $return = $return->where('job_title', 'like', '%' .Request::get('job_title'). '%'); //notify the two dots .   .
       }


       if(!empty(Request::get('start_date')) )
       {
         $return = $return->where('histories.start_date', '>=', Request::get('start_date') );
       }




//end logic of search



$return = $return->paginate(5);

  return $return;

}
}
