<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Request;

class Department extends Authenticatable
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
    public static function getRecord($request)
    {
        // Initialize the query with a join to include manager data
        $query = self::select('departments.*', 'managers.name as manager_name')
                     ->leftJoin('managers', 'departments.manager_id', '=', 'managers.id')
                     ->orderBy('departments.id', 'desc');

        // Apply search filter for department name if provided
        if ($request->filled('department_name')) {
            $query->where('departments.department_name', 'like', '%' . $request->input('department_name') . '%');
        }

        // Return paginated result
        return $query->paginate(5);
    }





public function attendances()
{
    return $this->hasMany(Attendance::class);
}


public function get_manager_single(){
    return $this->belongsTo(Manager::class, "manager_id");
}

public function users()
{
    return $this->hasMany(User::class);
}




}
