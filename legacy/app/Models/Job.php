<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Request;

class Job extends Authenticatable
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
        // Initialize the query with a join to include department data
        $query = self::select('jobs.*', 'departments.department_name')
                     ->leftJoin('departments', 'jobs.department_id', '=', 'departments.id')
                     ->orderBy('jobs.id', 'desc');

        // Apply filters based on request inputs
        if ($request->filled('id')) {
            $query->where('jobs.id', $request->input('id'));
        }

        if ($request->filled('job_title')) {
            $query->where('jobs.job_title', 'like', '%' . $request->input('job_title') . '%');
        }

        if ($request->filled('min_salary')) {
            $query->where('jobs.min_salary', 'like', '%' . $request->input('min_salary') . '%');
        }

        if ($request->filled('max_salary')) {
            $query->where('jobs.max_salary', 'like', '%' . $request->input('max_salary') . '%');
        }

        // Return paginated result
        return $query->paginate(5);
    }

public function get_department_single(){
    return $this->belongsTo(Department::class, "department_id");
}

}
