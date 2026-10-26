<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Request;

class Payroll extends Model
{
    use HasFactory;

    protected $fillable = [
        'employee_id',
        'base_salary',
        'bonuses',
        'deductions',
        'taxes',
        'net_pay',
        'pay_date'
    ];

    public function employee()
    {
        return $this->belongsTo(User::class);
    }

    static public function getRecord()
    {
        $return = self::select('payrolls.*', 'users.name')
            ->join('users', 'users.id', '=', 'payrolls.employee_id')
            ->orderBy('id', 'desc');

        // Search by name
        if (!empty(Request::get('name'))) {
            $return = $return->where('users.name', 'like', '%' . Request::get('name') . '%');
        }

        // Search by month
        if (!empty(Request::get('month'))) {
            $return = $return->whereMonth('payrolls.created_at', Request::get('month'));
        }

        // Search by year
        if (!empty(Request::get('year'))) {
            $return = $return->whereYear('payrolls.created_at', Request::get('year'));
        }

        $return = $return->paginate(15);

        return $return;
    }
}
