<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateLeavesTable extends Migration
{
    public function up()
    {
        Schema::create('leaves', function (Blueprint $table) {

            $table->id();
            $table->foreignId('employee_id')->constrained('users')->onDelete('cascade'); //on delete cascade de 34an lma ams7 al employee da from employees a3rf ams7o o kmaaan etms7 kman mn hna
            $table->string('leave_type')->nullable();
            $table->integer('leave_deduction')->nullable();

            $table->timestamps();

        });
    }

    public function down()
    {
        Schema::dropIfExists('leaves');
    }
}
