<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Request;

class Vacation extends Model
{
    use HasFactory;

    protected $fillable = [
        'employee_id',
        'start_date',
        'end_date',
        'vacation_type',
    ];

    public function user()
    {
        return $this->belongsTo(User::class, 'employee_id');
    }
    static public function getRecord($request){

        $return = self::select('vacations.*' ,'users.name')
        ->join('users','users.id', '=', 'vacations.employee_id')
        ->orderBy('id', 'desc');

 // logic of the search box



 if(!empty(Request::get('name')))
 {
   $return = $return->where('name', 'like', '%' .Request::get('name'). '%'); //notify the two dots .   .
 }



//end logic of search

        $return = $return->paginate(6);

        return $return;

        }


}
