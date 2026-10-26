<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */


    public function up()
    {
        Schema::create('times', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained('users')->onDelete('cascade'); //on delete cascade de 34an lma ams7 al employee da from employees a3rf ams7o o kmaaan etms7 kman mn hna
            $table->integer('hours')->nullable();
            $table->timestamps();

        });
    }

    public function down()
    {
        Schema::dropIfExists('times');
    }
};
