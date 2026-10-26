<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Request;

class Manager extends Authenticatable
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

$return = self::select('managers.*');

// logic of the search box

       if(!empty(Request::get('id')))
       {
         $return = $return->where('id', '=', Request::get('id'));
       }


       if(!empty(Request::get('name')))
       {
         $return = $return->where('name', 'like', '%' .Request::get('name'). '%'); //notify the two dots .   .
       }



//end logic of search



    $return = $return->orderBy('id', 'desc')
              ->paginate(5);

  return $return;

}





public function attendances()
{
    return $this->hasMany(Attendance::class);
}


public function get_department_single(){
    return $this->belongsTo(Department::class, "department_id");
}




}
