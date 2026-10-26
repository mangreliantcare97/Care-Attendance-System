<!-- Preloader -->

<!-- CSS Link (add inside <head>) -->
    <link rel="stylesheet" href="{{ asset('dist/css/darkmode.css') }}">


<div class="preloader flex-column justify-content-center align-items-center">
    <img class="animation__shake" src="{{ url('/dist/img/hr_logo-.png') }}"
        alt="AdminLTE Logo" height="60" width="60">
</div>

<!-- Navbar -->
<nav class="main-header navbar navbar-expand navbar-white navbar-light">
    <!-- Left navbar links -->
    <ul class="navbar-nav">
        <li class="nav-item">
            <a class="nav-link" data-widget="pushmenu" href="#" role="button"><i class="fas fa-bars"></i></a>
        </li>
    </ul>

    <!-- Right navbar links -->
    <ul class="navbar-nav ml-auto">




          <!-- Moon Icon for Dark Mode Toggle -->
       <li class="nav-item">
           <a class="nav-link dark-mode-toggle" role="button">
               <i class="nav-icon fa fa-moon" style="color: #908a8a;"></i>
          </a>
         </li>




         <li class="nav-item">
            <a href="{{ url('admin/do') }}" class="nav-link" role="button">
                <i class="nav-icon fa fa-tasks"></i>
            </a>
          </li>




         <li class="nav-item">
            <a href="{{ url('admin/charts') }}" class="nav-link" role="button">
                <i class="nav-icon fa fa-chart-bar"></i>
            </a>
        </li>




        <li class="nav-item">
            <a href="{{ url('admin/calendar') }}" class="nav-link" role="button">
                <i class="nav-icon fa fa-calendar-alt"></i>
            </a>
          </li>


        <li class="nav-item">
            <a class="nav-link" data-widget="fullscreen" href="#" role="button">
              <i class="fas fa-expand-arrows-alt"></i>
            </a>
          </li>



        <!-- Logout link -->

        <li class="nav-item">
            <a class="nav-link" href="{{ url('logout') }}">
                <i class="fas fa-sign-out-alt"></i>
            </a>
        </li>


    </ul>
</nav>
<!-- /.navbar -->

<!-- Main Sidebar Container -->
<aside class="main-sidebar sidebar-dark-primary elevation-4">
    <!-- Brand Logo -->
    <a  class="brand-link">
        <img src="{{ url('/dist/img/hr_logo-.png') }}" alt="AdminLTE Logo"
            class="brand-image img-circle elevation-3" style="opacity: .8">
        <span class="brand-text font-weight-light">Human Resource</span>
    </a>

    <!-- Sidebar -->
    <div class="sidebar">
        <!-- Sidebar user panel (optional) -->
        <div class="user-panel mt-3 pb-3 mb-3 d-flex">
            <div class="image">
                <img src="{{ url('/dist/img/admin.jpg') }}"
                    class="img-circle elevation-2" alt="User Image">
            </div>
            <div class="info">
                <a class="d-block">{{ Auth::user()->name }}</a>
            </div>
        </div>

        <!-- Sidebar Menu -->
        <nav class="mt-2">
            <ul class="nav nav-pills nav-sidebar flex-column" data-widget="treeview" role="menu" data-accordion="false">



                <!-- Dashboard -->
                <li class="nav-item">
                    <a href="{{ url('admin/dashboard') }}" class="nav-link @if(Request::segment(2) == 'dashboard' || Request::segment(2) == 'calendar' || Request::segment(2) == 'charts' || Request::segment(2) == 'do') active @endif">
                        <i class="nav-icon fa fa-tachometer-alt"></i>
                        <p>Dashboard</p>
                    </a>
                </li>



                <li class="nav-header">Main Information</li>

                <!-- Employees -->
                <li class="nav-item">
                    <a href="{{ url('admin/employees') }}" class="nav-link @if(Request::segment(2) == 'employees') active @endif">
                        <i class="nav-icon fa fa-users"></i>
                        <p>Employees</p>
                    </a>
                </li>



                <!-- Managers -->
                <li class="nav-item">
                    <a href="{{ url('admin/manager') }}" class="nav-link @if(Request::segment(2) == 'manager') active @endif">
                        <i class="nav-icon fa fa-user"></i>
                        <p>Managers</p>
                    </a>
                </li>



                   <!-- Departments -->
                   <li class="nav-item">
                    <a href="{{ url('admin/department') }}" class="nav-link @if(Request::segment(2) == 'department') active @endif">
                        <i class="nav-icon fa fa-building"></i>
                        <p>Departments</p>
                    </a>
                </li>



                <!-- Jobs -->
                <li class="nav-item has-treeview @if(Request::segment(2) == 'jobs' || Request::segment(2) == 'job_history') menu-open @endif">
                    <a href="#" class="nav-link @if(Request::segment(2) == 'jobs' || Request::segment(2) == 'job_history') active @endif">
                        <i class="nav-icon fa fa-briefcase"></i>
                        <p>Jobs<i class="right fa fa-angle-left"></i></p>
                    </a>
                    <ul class="nav nav-treeview">
                        <li class="nav-item">
                            <a href="{{ url('admin/jobs') }}" class="nav-link @if(Request::segment(2) == 'jobs') active @endif">
                                <i class="fa fa-list nav-icon"></i>
                                <p>Current Jobs</p>
                            </a>
                        </li>
                        <li class="nav-item">
                            <a href="{{ url('admin/job_history') }}" class="nav-link @if(Request::segment(2) == 'job_history') active @endif">
                                <i class="fa fa-history nav-icon"></i>
                                <p>Job History</p>
                            </a>
                        </li>
                    </ul>
                </li>




                <li class="nav-header">Attendance & Payroll</li>




                <!-- Attendance -->
                <li class="nav-item">
                    <a href="{{ url('admin/attendance') }}" class="nav-link @if(Request::segment(2) == 'attendance') active @endif">
                        <i class="nav-icon fa fa-calendar-alt"></i>
                        <p>Attendance Manually</p>
                    </a>
                </li>




                <!-- Attendance Reports -->
                <li class="nav-item">
                    <a href="{{ url('admin/reports') }}" class="nav-link @if(Request::segment(2) == 'reports') active @endif">
                        <i class="nav-icon fa fa-file-alt"></i>
                        <p>Attendance Reports</p>
                    </a>
                </li>



                <!-- Leaves -->
                <li class="nav-item">
                    <a href="{{ url('admin/leaves') }}" class="nav-link @if(Request::segment(2) == 'leaves') active @endif">
                        <i class="nav-icon fa fa-clock"></i>
                        <p>Leave Excuses</p>
                    </a>
                </li>


                <!-- Vacations -->
                <li class="nav-item">
                    <a href="{{ url('admin/vacations') }}" class="nav-link @if(Request::segment(2) == 'vacations') active @endif">
                        <i class="nav-icon fa fa-umbrella-beach"></i>
                        <p> Vacations </p>
                    </a>
                </li>


                <!-- Bounas -->
                <li class="nav-item">
                    <a href="{{ url('admin/bounas') }}" class="nav-link @if(Request::segment(2) == 'bounas') active @endif">
                        <i class="nav-icon fa fa-dollar-sign"></i>
                        <p> OverTime </p>
                    </a>
                </li>



                <!-- Payroll -->
                <li class="nav-item">
                    <a href="{{ url('admin/payroll') }}" class="nav-link @if(Request::segment(2) == 'payroll') active @endif">
                        {{-- <i class="nav-icon fa fa-money-bill"></i> --}}
                        <i class="nav-icon fa fa-coins"></i>
                        <p>Payroll</p>
                    </a>
                </li>





                <li class="nav-header">Settings</li>

                <!-- My Account -->
                <li class="nav-item">
                    <a href="{{ url('admin/my_account') }}" class="nav-link @if(Request::segment(2) == 'my_account') active @endif">
                        <i class="nav-icon fa fa-cog"></i>
                        <p>My Account</p>
                    </a>
                </li>
            </ul>
        </nav>
        <!-- /.sidebar-menu -->
    </div>
    <!-- /.sidebar -->
</aside>




    <!-- JavaScript Link (add before closing </body> tag) -->
    <script src="{{ asset('dist/js/darkmode.js') }}"></script>
