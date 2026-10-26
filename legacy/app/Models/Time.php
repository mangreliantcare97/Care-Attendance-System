<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Request;

class Time extends Model
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


    static public function getRecord($request){

        $return = self::select('times.*' ,'users.name')
        ->join('users','users.id', '=', 'times.employee_id')
        ->orderBy('id', 'desc');


        // logic of the search box



               if(!empty(Request::get('name')))
               {
                 $return = $return->where('name', 'like', '%' .Request::get('name'). '%'); //notify the two dots .   .
               }



        //end logic of search



        $return = $return->paginate(5);

        return $return;

        }



        public function user()
        {
            return $this->belongsTo(User::class, 'employee_id');
        }



}
