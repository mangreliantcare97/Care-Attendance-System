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
        Schema::create('jobs', function (Blueprint $table) {
            $table->id();
            $table->string('job_title')->nullable();
            $table->integer('min_salary')->nullable();
            $table->integer('max_salary')->nullable();
            $table->foreignId('department_id')->nullable()->constrained('departments')->onDelete('set null');

            $table->timestamps();


        });
    }

    public function down()
    {
        Schema::dropIfExists('jobs');
    }
};
