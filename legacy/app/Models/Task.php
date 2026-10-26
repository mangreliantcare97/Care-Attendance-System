<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class Task extends Model
{
    use HasFactory;

    protected $fillable = ['task']; // Add 'task' to the fillable array
    public function up()
{
    Schema::create('tasks', function (Blueprint $table) {
        $table->id();
        $table->string('task');
        $table->boolean('completed')->default(false);
        $table->timestamps();
    });
}

}
