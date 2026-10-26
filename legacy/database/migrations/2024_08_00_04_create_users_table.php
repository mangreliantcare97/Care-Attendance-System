<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('email')->unique()->nullable();;
            $table->timestamp('email_verified_at')->nullable();
            $table->string('password')->nullable();;
            $table->string('phone_number')->nullable();
            $table->date('hire_date')->nullable();
            $table->foreignId('job_id')->nullable()->constrained()->onDelete('set null');
            $table->string('salary')->nullable();
            $table->string('commission_pct')->nullable();
            $table->foreignId('manager_id')->nullable()->constrained()->onDelete('set null');
            $table->foreignId('department_id')->nullable()->constrained()->onDelete('set null');
            $table->rememberToken();
            $table->boolean('is_role')->default(1);  // Boolean for role, default is 1 (could represent a default role)
            $table->timestamps();  // Created_at and updated_at timestamps
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('users');  // Drop users table if it exists
    }
};
